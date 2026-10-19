; Updates run with --updated (older Soniq versions omit /S). Instead of a fully
; silent install, show only the progress page so users can see the update is
; working, then relaunch Soniq. Manual installs keep the full wizard.

!macro customInstallMode
  ; Reuse the existing install scope so the "who should this be installed for" page is skipped.
  ${If} ${isUpdated}
    ${If} $hasPerMachineInstallation == "1"
      StrCpy $isForceMachineInstall "1"
    ${Else}
      StrCpy $isForceCurrentInstall "1"
    ${EndIf}
  ${EndIf}
!macroend

!macro customFinishPage
  Function StartApp
    ${If} ${isUpdated}
      StrCpy $1 "--updated"
    ${Else}
      StrCpy $1 ""
    ${EndIf}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  Function skipFinishPageIfUpdated
    ${If} ${isUpdated}
      ; otherwise the app window opens behind the installer
      HideWindow
      Call StartApp
      Abort
    ${EndIf}
  FunctionEnd

  !define MUI_PAGE_CUSTOMFUNCTION_PRE skipFinishPageIfUpdated
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !insertmacro MUI_PAGE_FINISH
!macroend
