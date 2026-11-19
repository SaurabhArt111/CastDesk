; Opens the Windows Firewall for Paneo on private + domain networks so other
; devices can find and reach this PC. Removed again on uninstall.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Paneo"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Paneo" dir=in action=allow program="$INSTDIR\Paneo.exe" enable=yes profile=private,domain'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Paneo-discovery" dir=in action=allow protocol=UDP localport=5353,7421 profile=private,domain'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Paneo"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Paneo-discovery"'
!macroend
