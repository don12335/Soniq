!macro customInit
  ; Older Soniq versions launch updates with --updated but without /S.
  ; Keep that upgrade path silent while leaving manual installs interactive.
  ${If} ${isUpdated}
    SetSilent silent
  ${EndIf}
!macroend
