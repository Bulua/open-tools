pub(crate) mod branding;
#[cfg(windows)]
pub(crate) mod dpapi;
#[cfg(windows)]
pub(crate) mod notifications;
pub(crate) mod paths;
pub(crate) mod process;
pub(crate) mod script;
#[cfg(desktop)]
pub(crate) mod tray;
#[cfg(mobile)]
#[path = "tray_mobile.rs"]
pub(crate) mod tray;
