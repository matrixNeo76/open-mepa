import threading
import time
import urllib.request
import json
import sqlite3
import os
from script_generatore_database_sqlite_3 import run_server

# Start server in background thread on port 8008
server_thread = threading.Thread(target=run_server, kwargs={'port': 8008}, daemon=True)
server_thread.start()
time.sleep(1)

base = 'http://127.0.0.1:8008'

# Test 1: GET /api/status
req = urllib.request.urlopen(f'{base}/api/status')
status = json.loads(req.read().decode())
print('Status test:', status)
assert status['status'] == 'connected'
assert status['database'] == 'gare_consip.db'

# Test 2: GET /api/gare
req = urllib.request.urlopen(f'{base}/api/gare')
gare = json.loads(req.read().decode())
print(f'Gare count: {len(gare)}')
assert len(gare) >= 7

# Test 3: POST /api/gare (new tender)
new_tender = {
    'id': 'TEST_01',
    'cig': 'Z998877665',
    'category': 'IT',
    'region': 'Lazio',
    'source': 'RdO MePA',
    'authority': 'Ministero Sviluppo Economico',
    'title': 'Test gara automatizzata per collaudo',
    'amount': 75000.0,
    'deadline': '2026-12-01T10:00',
    'status': 'Da Valutare',
    'owner': 'Tester AI',
    'link': 'https://www.acquistinretepa.it'
}
data_bytes = json.dumps(new_tender).encode('utf-8')
post_req = urllib.request.Request(f'{base}/api/gare', data=data_bytes, headers={'Content-Type': 'application/json'}, method='POST')
res = urllib.request.urlopen(post_req)
print('POST /api/gare result:', json.loads(res.read().decode()))

# Test 4: Direct SQLite verification
conn = sqlite3.connect('gare_consip.db')
cur = conn.cursor()
cur.execute("SELECT cig, title, amount FROM gare WHERE cig='Z998877665'")
row = cur.fetchone()
print('Direct SQLite row:', row)
assert row is not None
assert row[0] == 'Z998877665'

# Test 5: DELETE /api/gare/TEST_01
del_req = urllib.request.Request(f'{base}/api/gare/TEST_01', method='DELETE')
res = urllib.request.urlopen(del_req)
print('DELETE result:', json.loads(res.read().decode()))

cur.execute("SELECT COUNT(*) FROM gare WHERE cig='Z998877665'")
count = cur.fetchone()[0]
print('Direct SQLite count after deletion:', count)
assert count == 0
conn.close()

# Test 6: GET / (serves HTML)
html_req = urllib.request.urlopen(f'{base}/')
html_content = html_req.read().decode('utf-8')
assert '<title>MePA &amp; Consip Desk Pro' in html_content
assert 'selectPageSize' in html_content
assert 'handleDragOver' in html_content
print(f'HTML served correctly, size: {len(html_content)} bytes')

# Test 7: POST /api/workflow
wf_payload = {
    'gara_id': 'T1',
    'current_step': 2,
    'step1_data': {'cig': 'A045B891C1', 'ente': 'Comune di Bologna', 'oggetto': 'Fornitura server'},
    'step2_data': {'decision': 'GO', 'margin': 15.0},
    'step3_data': {'bustaA': {'dgue': True}},
    'step4_data': {'outcome': 'In attesa'}
}
wf_data = json.dumps(wf_payload).encode('utf-8')
wf_req = urllib.request.Request(f'{base}/api/workflow', data=wf_data, headers={'Content-Type': 'application/json'}, method='POST')
wf_res = json.loads(urllib.request.urlopen(wf_req).read().decode())
print('POST /api/workflow result:', wf_res)
assert wf_res['status'] == 'success'
assert wf_res['gara_id'] == 'T1'

# Test 8: GET /api/workflow
wf_get_req = urllib.request.urlopen(f'{base}/api/workflow?gara_id=T1')
wf_get_res = json.loads(wf_get_req.read().decode())
print('GET /api/workflow result:', wf_get_res)
assert wf_get_res['gara_id'] == 'T1'
assert wf_get_res['current_step'] == 2
assert wf_get_res['step2_data']['decision'] == 'GO'

print('\n*** TUTTI I TEST SONO PASSATI CON SUCCESSO! ***')
