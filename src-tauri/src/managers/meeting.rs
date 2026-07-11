//! Modo Reunión: sesiones largas de grabación pensadas para reuniones.
//!
//! La grabación rota en bloques de ~60 s: cada bloque se transcribe localmente
//! (en orden, mientras el siguiente ya se está grabando) y al final se arma un
//! transcript con marcas de tiempo. La minuta se genera a pedido con el mismo
//! proveedor LLM configurado para el post-procesado.
//!
//! El hueco entre bloques es el tiempo de rotar el micrófono (milisegundos):
//! aceptable para una reunión, y mantiene acotados la memoria y el tiempo de
//! transcripción por bloque.

use crate::audio_toolkit::VadPolicy;
use crate::managers::audio::AudioRecordingManager;
use crate::managers::history::HistoryManager;
use crate::managers::transcription::TranscriptionManager;
use crate::settings::get_settings;
use log::{debug, error};
use serde::Serialize;
use specta::Type;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const MEETING_BINDING_ID: &str = "meeting_mode";
/// Largo de cada bloque de grabación. Corto para acotar memoria y latencia de
/// transcripción; largo para que el hueco de rotación sea despreciable.
const CHUNK_SECS: u64 = 60;
const POLL: Duration = Duration::from_millis(200);

#[derive(Clone, Debug, Serialize, Type)]
pub struct MeetingStatus {
    pub active: bool,
    pub meeting_id: Option<i64>,
    /// Unix seconds del inicio, para reconstruir el timer al recargar la UI.
    pub started_at: Option<i64>,
    pub segments_done: u32,
    pub finishing: bool,
}

#[derive(Clone, Serialize)]
struct MeetingProgressEvent {
    meeting_id: i64,
    segments_done: u32,
    last_text: String,
}

#[derive(Clone, Serialize)]
struct MeetingFinishedEvent {
    meeting_id: i64,
    cancelled: bool,
}

struct ActiveMeeting {
    id: i64,
    started_at: i64,
    stop_requested: Arc<AtomicBool>,
    cancel_requested: Arc<AtomicBool>,
    finishing: Arc<AtomicBool>,
    segments_done: Arc<AtomicU32>,
}

pub struct MeetingManager {
    app: AppHandle,
    active: Mutex<Option<ActiveMeeting>>,
}

impl MeetingManager {
    pub fn new(app: &AppHandle) -> Self {
        Self {
            app: app.clone(),
            active: Mutex::new(None),
        }
    }

    pub fn status(&self) -> MeetingStatus {
        let guard = self.active.lock().unwrap();
        match guard.as_ref() {
            Some(m) => MeetingStatus {
                active: true,
                meeting_id: Some(m.id),
                started_at: Some(m.started_at),
                segments_done: m.segments_done.load(Ordering::Relaxed),
                finishing: m.finishing.load(Ordering::Relaxed),
            },
            None => MeetingStatus {
                active: false,
                meeting_id: None,
                started_at: None,
                segments_done: 0,
                finishing: false,
            },
        }
    }

    /// Arranca una sesión de reunión. Falla si ya hay una activa o si el
    /// micrófono está ocupado por un dictado en curso.
    pub fn start(&self, title: String) -> Result<i64, String> {
        let mut guard = self.active.lock().unwrap();
        if guard.is_some() {
            return Err("meeting_already_active".to_string());
        }

        let rm = self.app.state::<Arc<AudioRecordingManager>>();
        if rm.is_recording() {
            return Err("recording_busy".to_string());
        }

        let hm = self.app.state::<Arc<HistoryManager>>();
        let id = hm.create_meeting(title).map_err(|e| e.to_string())?;
        let started_at = chrono::Utc::now().timestamp();

        // Precalentar el modelo ASR para que el primer bloque no pague la carga.
        self.app
            .state::<Arc<TranscriptionManager>>()
            .initiate_model_load();

        let stop_requested = Arc::new(AtomicBool::new(false));
        let cancel_requested = Arc::new(AtomicBool::new(false));
        let finishing = Arc::new(AtomicBool::new(false));
        let segments_done = Arc::new(AtomicU32::new(0));

        let (tx, rx) = mpsc::channel::<(u64, Vec<f32>)>();

        // Hilo grabador: rota bloques hasta que pidan parar o cancelar.
        {
            let app = self.app.clone();
            let stop = Arc::clone(&stop_requested);
            let cancel = Arc::clone(&cancel_requested);
            std::thread::spawn(move || {
                let rm = app.state::<Arc<AudioRecordingManager>>();
                let meeting_start = Instant::now();
                loop {
                    if stop.load(Ordering::Relaxed) || cancel.load(Ordering::Relaxed) {
                        break;
                    }
                    let chunk_offset = meeting_start.elapsed().as_secs();
                    let generation = rm.cancel_generation();
                    if let Err(e) = rm.try_start_recording(MEETING_BINDING_ID, VadPolicy::Offline)
                    {
                        error!("Meeting recording failed to start: {}", e);
                        let _ = app.emit("meeting-error", e);
                        cancel.store(true, Ordering::Relaxed);
                        break;
                    }
                    let chunk_start = Instant::now();
                    while chunk_start.elapsed().as_secs() < CHUNK_SECS
                        && !stop.load(Ordering::Relaxed)
                        && !cancel.load(Ordering::Relaxed)
                    {
                        std::thread::sleep(POLL);
                    }
                    let samples = rm.stop_recording(MEETING_BINDING_ID, generation);
                    if cancel.load(Ordering::Relaxed) {
                        break;
                    }
                    if let Some(samples) = samples {
                        if !samples.is_empty() {
                            debug!(
                                "Meeting chunk at {}s: {} samples queued",
                                chunk_offset,
                                samples.len()
                            );
                            let _ = tx.send((chunk_offset, samples));
                        }
                    }
                    if stop.load(Ordering::Relaxed) {
                        break;
                    }
                }
                // Cerrar el canal marca el fin de la sesión para el transcriptor.
                drop(tx);
            });
        }

        // Hilo transcriptor: consume bloques en orden y arma el transcript.
        {
            let app = self.app.clone();
            let cancel = Arc::clone(&cancel_requested);
            let segments_done = Arc::clone(&segments_done);
            std::thread::spawn(move || {
                let tm = app.state::<Arc<TranscriptionManager>>();
                let hm = app.state::<Arc<HistoryManager>>();
                let mut segments: Vec<String> = Vec::new();
                while let Ok((offset, samples)) = rx.recv() {
                    if cancel.load(Ordering::Relaxed) {
                        continue; // drenar el canal sin trabajar de más
                    }
                    match tm.transcribe(samples) {
                        Ok(text) => {
                            let text = text.trim().to_string();
                            if !text.is_empty() {
                                segments.push(format!(
                                    "[{:02}:{:02}] {}",
                                    offset / 60,
                                    offset % 60,
                                    text
                                ));
                                let n = segments_done.fetch_add(1, Ordering::Relaxed) + 1;
                                let _ = app.emit(
                                    "meeting-progress",
                                    MeetingProgressEvent {
                                        meeting_id: id,
                                        segments_done: n,
                                        last_text: text,
                                    },
                                );
                            }
                        }
                        Err(e) => error!("Meeting chunk transcription failed: {}", e),
                    }
                }

                let cancelled = cancel.load(Ordering::Relaxed);
                if cancelled {
                    if let Err(e) = hm.delete_meeting(id) {
                        error!("Failed to delete cancelled meeting {}: {}", id, e);
                    }
                } else {
                    let transcript = segments.join("\n");
                    if let Err(e) = hm.finish_meeting(id, transcript) {
                        error!("Failed to persist meeting {}: {}", id, e);
                    }
                }

                if let Some(mm) = app.try_state::<Arc<MeetingManager>>() {
                    mm.clear_active();
                }
                let _ = app.emit(
                    "meeting-finished",
                    MeetingFinishedEvent {
                        meeting_id: id,
                        cancelled,
                    },
                );
            });
        }

        *guard = Some(ActiveMeeting {
            id,
            started_at,
            stop_requested,
            cancel_requested,
            finishing,
            segments_done,
        });

        Ok(id)
    }

    /// Termina la sesión: deja de grabar y transcribe lo que falte.
    pub fn stop(&self) -> Result<(), String> {
        let guard = self.active.lock().unwrap();
        match guard.as_ref() {
            Some(m) => {
                m.finishing.store(true, Ordering::Relaxed);
                m.stop_requested.store(true, Ordering::Relaxed);
                Ok(())
            }
            None => Err("no_active_meeting".to_string()),
        }
    }

    /// Cancela la sesión y descarta todo lo grabado.
    pub fn cancel(&self) -> Result<(), String> {
        let guard = self.active.lock().unwrap();
        match guard.as_ref() {
            Some(m) => {
                m.finishing.store(true, Ordering::Relaxed);
                m.cancel_requested.store(true, Ordering::Relaxed);
                Ok(())
            }
            None => Err("no_active_meeting".to_string()),
        }
    }

    /// Devuelve el id de la reunión activa, si hay una.
    pub fn active_meeting_id(&self) -> Option<i64> {
        self.active.lock().unwrap().as_ref().map(|m| m.id)
    }

    fn clear_active(&self) {
        *self.active.lock().unwrap() = None;
    }
}

/// Genera la minuta de una reunión con el proveedor LLM del post-procesado y
/// la plantilla `meeting_minutes_prompt` de los ajustes.
pub async fn generate_minutes(app: &AppHandle, meeting_id: i64) -> Result<String, String> {
    let hm = app.state::<Arc<HistoryManager>>();
    let meeting = hm.get_meeting(meeting_id).map_err(|e| e.to_string())?;
    if meeting.transcript.trim().is_empty() {
        return Err("empty_transcript".to_string());
    }

    let settings = get_settings(app);
    let provider = settings
        .active_post_process_provider()
        .cloned()
        .ok_or_else(|| "no_provider".to_string())?;
    let model = settings
        .post_process_models
        .get(&provider.id)
        .cloned()
        .unwrap_or_default();
    if model.trim().is_empty() {
        return Err("no_model".to_string());
    }
    let api_key = settings
        .post_process_api_keys
        .get(&provider.id)
        .cloned()
        .unwrap_or_default();
    let template = settings.meeting_minutes_prompt.clone();

    // Mismo criterio que el post-procesado: sin razonamiento donde no aporta.
    let (reasoning_effort, reasoning) = match provider.id.as_str() {
        "custom" => (Some("none".to_string()), None),
        "openrouter" => (
            None,
            Some(crate::llm_client::ReasoningConfig {
                effort: Some("none".to_string()),
                exclude: Some(true),
            }),
        ),
        _ => (None, None),
    };

    let minutes = crate::llm_client::send_chat_completion_with_schema(
        &provider,
        api_key,
        &model,
        meeting.transcript.clone(),
        Some(template.clone()),
        None,
        reasoning_effort,
        reasoning,
    )
    .await?
    .filter(|m| !m.trim().is_empty())
    .ok_or_else(|| "empty_response".to_string())?;

    hm.set_meeting_minutes(meeting_id, minutes.clone(), template)
        .map_err(|e| e.to_string())?;

    Ok(minutes)
}
