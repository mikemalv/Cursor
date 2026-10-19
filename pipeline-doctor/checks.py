"""Independent regression checks run in a fresh child Python process."""
from pathlib import Path
import json
import os
import subprocess
import sys

CASES = [
    ("ordinary campaign", [{"name":"Launch","clicks":20,"conversions":5}],
     {"campaigns":[{"name":"Launch","rate":0.25}],"total_conversions":5,"top_campaign":"Launch"}),
    ("zero clicks remains visible", [{"name":"Quiet","clicks":0,"conversions":0}],
     {"campaigns":[{"name":"Quiet","rate":None}],"total_conversions":0,"top_campaign":None}),
    ("empty result set", [], {"campaigns":[],"total_conversions":0,"top_campaign":None}),
    ("mixed campaigns and correct winner", [{"name":"Quiet","clicks":0,"conversions":0},{"name":"A","clicks":10,"conversions":2},{"name":"B","clicks":10,"conversions":3}],
     {"campaigns":[{"name":"Quiet","rate":None},{"name":"A","rate":0.2},{"name":"B","rate":0.3}],"total_conversions":5,"top_campaign":"B"}),
    ("zero conversion is a defined rate", [{"name":"A","clicks":10,"conversions":0},{"name":"B","clicks":0,"conversions":0}],
     {"campaigns":[{"name":"A","rate":0.0},{"name":"B","rate":None}],"total_conversions":0,"top_campaign":"A"}),
    ("ties preserve input order", [{"name":"First","clicks":4,"conversions":1},{"name":"Second","clicks":8,"conversions":2}],
     {"campaigns":[{"name":"First","rate":0.25},{"name":"Second","rate":0.25}],"total_conversions":3,"top_campaign":"First"}),
]

WORKER = r'''
import copy, json, runpy, sys
payload = json.loads(sys.stdin.read())
try:
    function = runpy.run_path(payload["path"])["summarize_campaigns"]
    results=[]
    for name, rows, expected in payload["cases"]:
        original=copy.deepcopy(rows)
        try:
            actual=function(rows)
            valid=actual==expected and rows==original
            results.append({"name":name,"passed":valid,"actual":actual,"expected":expected,
                            "input_unchanged":rows==original})
        except Exception as error:
            results.append({"name":name,"passed":False,"error":type(error).__name__+": "+str(error)})
    print(json.dumps({"passed":all(r["passed"] for r in results),"checks":results},allow_nan=False))
except Exception as error:
    print(json.dumps({"passed":False,"checks":[],"error":type(error).__name__+": "+str(error)}))
'''


def verify(path: Path) -> dict:
    """No API credentials inherited by the test process. This is not an OS sandbox."""
    try:
        result = subprocess.run([sys.executable, "-I", "-c", WORKER],
            input=json.dumps({"path":str(path.resolve()),"cases":CASES}),
            text=True,capture_output=True,timeout=10,cwd=path.parent,
            env={"PATH":os.defpath,"PYTHONIOENCODING":"utf-8"})
        if result.returncode:
            return {"passed":False,"checks":[],"error":result.stderr[-2000:]}
        return json.loads(result.stdout)
    except (subprocess.TimeoutExpired, json.JSONDecodeError) as error:
        return {"passed":False,"checks":[],"error":type(error).__name__}
