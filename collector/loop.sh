#!/bin/bash
# temporary local logger: saves the JPS live JSON every 15 minutes
while true; do
  ts=$(TZ=Asia/Kuala_Lumpur date +%Y%m%dT%H%M)
  curl -sSL -m 90 -A "JagaBanjir/0.1 (student project)" "https://publicinfobanjir.water.gov.my/wp-content/themes/enlighten/data/latestreadingstrendabc.json" -o /home/claude/jagabanjir/data/log/$ts.json
  sleep 900
done
