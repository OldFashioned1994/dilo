//! Comandos del Modo Reunión.

use crate::managers::history::{HistoryManager, MeetingEntry};
use crate::managers::meeting::{self, MeetingManager, MeetingStatus};
use crate::settings::{get_settings, write_settings};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

#[tauri::command]
#[specta::specta]
pub fn start_meeting(app: AppHandle, title: String) -> Result<i64, String> {
    app.state::<Arc<MeetingManager>>().start(title)
}

#[tauri::command]
#[specta::specta]
pub fn stop_meeting(app: AppHandle) -> Result<(), String> {
    app.state::<Arc<MeetingManager>>().stop()
}

#[tauri::command]
#[specta::specta]
pub fn cancel_meeting(app: AppHandle) -> Result<(), String> {
    app.state::<Arc<MeetingManager>>().cancel()
}

#[tauri::command]
#[specta::specta]
pub fn get_meeting_status(app: AppHandle) -> MeetingStatus {
    app.state::<Arc<MeetingManager>>().status()
}

#[tauri::command]
#[specta::specta]
pub fn list_meetings(app: AppHandle) -> Result<Vec<MeetingEntry>, String> {
    app.state::<Arc<HistoryManager>>()
        .list_meetings()
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn get_meeting(app: AppHandle, meeting_id: i64) -> Result<MeetingEntry, String> {
    app.state::<Arc<HistoryManager>>()
        .get_meeting(meeting_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn generate_meeting_minutes(app: AppHandle, meeting_id: i64) -> Result<String, String> {
    meeting::generate_minutes(&app, meeting_id).await
}

#[tauri::command]
#[specta::specta]
pub fn delete_meeting(app: AppHandle, meeting_id: i64) -> Result<(), String> {
    let mm = app.state::<Arc<MeetingManager>>();
    if mm.active_meeting_id() == Some(meeting_id) {
        return Err("meeting_active".to_string());
    }
    app.state::<Arc<HistoryManager>>()
        .delete_meeting(meeting_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn rename_meeting(app: AppHandle, meeting_id: i64, title: String) -> Result<(), String> {
    app.state::<Arc<HistoryManager>>()
        .rename_meeting(meeting_id, title)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn update_meeting_minutes_prompt(app: AppHandle, prompt: String) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.meeting_minutes_prompt = prompt;
    write_settings(&app, settings);
    Ok(())
}
