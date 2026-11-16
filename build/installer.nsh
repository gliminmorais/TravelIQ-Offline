!macro customInstall
  CreateShortCut "$SMPROGRAMS\Uninstall TravelIQ Offline.lnk" "$INSTDIR\${UNINSTALL_FILENAME}"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Uninstall TravelIQ Offline.lnk"
!macroend
