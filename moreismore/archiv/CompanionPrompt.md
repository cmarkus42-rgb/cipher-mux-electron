Handover-Prompt:                                                              
   
  Handover von vorheriger Watchdog-Session. Hier der Stand:                     
                                                                                
  ## Kontext                                                                    
  Wir testen cipher-mux v0.11 systematisch. Es gibt 8 Test Case Notes (alle mit 
  Tag "testcase", noteType "testcase", Prefix "TC:"). Lies sie mit              
  mux_notes_search query "TC".                 
                                                                                
  ## Erledigte Tests — T-GR: Grid & Session-Stabilität                          
   
  | Test | Ergebnis | Anmerkung |                                               
  |------|----------|-----------|              
  | T-GR.2 | PASS | Quellzelle zeigt "+" nach Verschieben |
  | T-GR.4 | PASS | Swap funktioniert |                                         
  | T-GR.5 | FAIL | LauncherCell zeigt nicht welche Presets laufen — Bug melden
  |                                                                             
  | T-GR.6 | PASS | Keine Geister-Sessions |   
  | T-GR.7 | PASS | GridSelector zeigt korrekte Aufteilung |                    
  | T-GR.8 | PASS | GridSelector = echtes Grid |
  | T-GR.11 | INVALID | Testcase macht keinen Sinn — Fenster ist nicht frei     
  skalierbar, Grid ändert sich nur über Spalten/Zeilen. Muss umformuliert oder  
  gestrichen werden |                                                           
                                                                                
  Noch offen in T-GR: T-GR.10, T-GR.13, T-GR.14, T-GR.15                        
   
  ## Bereits gemeldete Bugs (als Note)                                          
  - "BUG: Grid-Place via MCP schiebt Sessions in Hintergrund" (ID:
  01KQCA1PM242MDJ1Q31Z6KZ84Z)                                                   
                                               
  ## Noch zu melden (Bug)                                                       
  - LauncherCell-Popup zeigt nicht welche Presets bereits laufen (T-GR.5 FAIL)
                                                                                
  ## Beobachtung                               
  - GridSelector-Popup kam sporadisch hoch beim Zellenbelegen (nicht            
  reproduzierbar, evtl. Cache)                                                  
  - MCP-Connection ging nach Hard-Restart verloren (relevant für T-MX.8/T-MX.9)
                                                                                
  ## Nächste Schritte                                                           
  1. Bug für T-GR.5 als Note anlegen                                            
  2. T-GR.11 in der TC-Note als INVALID markieren oder umformulieren            
  3. Ergebnisse direkt in die TC-Note "TC: Grid & Session-Stabilitaet" updaten  
  (mux_notes_update)                                                            
  4. User die Testcase-View in der Sidebar zeigen                               
  5. Restliche T-GR Tests durchgehen (T-GR.10, 13, 14, 15)                      
  6. Dann weiter mit nächster TC-Suite                                          
                                                                                
  ---                                                                           
  Starte mich neu und gib mir das. Dann mach ich weiter und zeig dir die        
  Testcase-View!                                     