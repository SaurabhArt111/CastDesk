; Opens the Windows Firewall for CastDesk on private + domain networks so other
; devices can find and reach this PC. Removed again on uninstall.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="CastDesk"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="CastDesk" dir=in action=allow program="$INSTDIR\CastDesk.exe" enable=yes profile=private,domain'
  nsExec::Exec 'netsh advfirewall firewall add rule name="CastDesk-discovery" dir=in action=allow protocol=UDP localport=5353,7421 profile=private,domain'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="CastDesk"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="CastDesk-discovery"'
!macroend
