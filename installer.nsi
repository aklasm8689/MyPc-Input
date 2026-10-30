; =========================================================================
; MyPc-Input - Lightweight Native Windows Installer Script
; =========================================================================

!define APP_NAME "MyPc-Input"
!define APP_VERSION "1.0.0"
!define APP_PUBLISHER "Aklas"
!define APP_EXE "MyPc-Input.exe"
!define APP_ICON "app.ico"

Name "${APP_NAME}"
OutFile "MyPc-Input-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\${APP_NAME}"
InstallDirRegKey HKCU "Software\${APP_NAME}" "InstallDir"
RequestExecutionLevel user

SetCompressor /SOLID lzma

; Version Information
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey "LegalCopyright" "${APP_PUBLISHER}"
VIAddVersionKey "FileDescription" "${APP_NAME} Installer"
VIAddVersionKey "FileVersion" "${APP_VERSION}.0"

; Icons
Icon "${APP_ICON}"
UninstallIcon "${APP_ICON}"

; Pages
Page directory
Page instfiles

UninstPage uninstConfirm
UninstPage instfiles

; -------------------------------------------------------------------------
; Installation Section
; -------------------------------------------------------------------------
Section "Install"
  ; 1. Kill any running instance before updating
  nsExec::Exec 'taskkill /f /im "${APP_EXE}"'
  Sleep 500

  ; 2. Copy files
  SetOutPath "$INSTDIR"
  File "${APP_EXE}"
  File "${APP_ICON}"

  ; 3. Write Uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; 4. Create Desktop Shortcut
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_ICON}" 0

  ; 5. Create Start Menu Shortcuts
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_ICON}" 0
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\uninstall.exe" 0

  ; 6. Configure Auto-Start on Windows Boot (starts minimized in background)
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_NAME}" '"$INSTDIR\${APP_EXE}" --background'

  ; 7. Register in Windows "Installed Applications" / "Add or Remove Programs"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayIcon" "$INSTDIR\${APP_ICON},0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "NoRepair" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "EstimatedSize" 1200

  ; 8. Save installation directory
  WriteRegStr HKCU "Software\${APP_NAME}" "InstallDir" "$INSTDIR"

  ; 9. Launch the app immediately (detached via ShellExecute)
  ExecShell "" "$INSTDIR\${APP_EXE}"
SectionEnd

; -------------------------------------------------------------------------
; Uninstallation Section
; -------------------------------------------------------------------------
Section "Uninstall"
  ; Kill running instance
  nsExec::Exec 'taskkill /f /im "${APP_EXE}"'
  Sleep 500

  ; Remove shortcuts
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Uninstall ${APP_NAME}.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"

  ; Remove registry keys
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_NAME}"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
  DeleteRegKey HKCU "Software\${APP_NAME}"

  ; Remove installed files
  Delete "$INSTDIR\${APP_EXE}"
  Delete "$INSTDIR\${APP_ICON}"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
