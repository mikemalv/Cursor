"""Execute actual proposal SQL against synthetic DuckDB data, never Snowflake.

Only parsed SELECT statements can run. External access and extension loading
are disabled. Assertions are independent of the supplied proposal.
"""
import math
from threading import Timer
import duckdb


def verify_sql(incident_id: str, sql: str) -> dict:
    db = duckdb.connect(config={"enable_external_access": "false", "allow_unsigned_extensions": "false", "threads": "1", "memory_limit": "256MB"})
    deadline = Timer(5, db.interrupt)
    deadline.daemon = True
    deadline.start()
    try:
        db.execute("ATTACH ':memory:' AS analytics")
        db.execute("CREATE SCHEMA analytics.marketing")
        db.execute("CREATE SCHEMA analytics.player")
        db.execute("CREATE TABLE analytics.marketing.campaign_daily(campaign_id INTEGER, campaign_name VARCHAR, spend DOUBLE, impressions INTEGER)")
        db.execute("INSERT INTO analytics.marketing.campaign_daily VALUES (1,'Active',100,50),(1,'Active',50,50),(2,'Zero',80,0),(3,'Empty',0,0),(4,'Normal',12,6),(5,'Missing',10,NULL)")
        db.execute("CREATE TABLE analytics.player.player_profile(player_id INTEGER, host_id INTEGER, tier_cd VARCHAR, segment_cd VARCHAR, theo_win_30d DOUBLE, last_visit_dt DATE, email VARCHAR, date_of_birth DATE)")
        db.execute("INSERT INTO analytics.player.player_profile VALUES (1,10,'GOLD','ACTIVE',100,'2026-09-01','synthetic@example.invalid','1990-01-01'),(2,11,'SILVER','NEW',20,'2026-09-02',NULL,NULL)")
        statements = db.extract_statements(sql)
        if len(statements) != 1 or statements[0].type != duckdb.StatementType.SELECT:
            raise ValueError("proposal must be exactly one SELECT")
        db.execute("SET lock_configuration=true")
        cursor = db.execute(sql)
        columns = [c[0].lower() for c in cursor.description]
        rows = cursor.fetchmany(101)
        checks = []
        if incident_id == "roi":
            checks.append(("Output contract preserved", columns == ['campaign_id','campaign_name','spend','impressions','roi']))
            expected = [(1,'Active',150.0,100,1.5),(2,'Zero',80.0,0,None),(3,'Empty',0.0,0,None),(4,'Normal',12.0,6,2.0),(5,'Missing',10.0,None,None)]
            checks.append(("All campaigns retained; totals and ordinary ratios unchanged; zero/missing denominator returns NULL", sorted(rows, key=lambda r: str(r[0])) == expected))
            checks.append(("No infinite or NaN metrics", all(not isinstance(v,float) or math.isfinite(v) for r in rows for v in r)))
        elif incident_id == "pii":
            checks.append(("Explicit safe output columns", columns == ['player_id','host_id','tier_cd','segment_cd','theo_win_30d','last_visit_dt']))
            expected = db.execute("SELECT player_id,host_id,tier_cd,segment_cd,theo_win_30d,last_visit_dt FROM analytics.player.player_profile ORDER BY player_id").fetchall()
            checks.append(("All permitted values preserved", sorted(rows, key=lambda r: str(r[0])) == expected))
        else:
            raise ValueError("no executable local verifier for this scenario")
        # JSON has no NaN/Infinity values. Preserve failures as explicit strings.
        serialized_rows = [[str(v) if isinstance(v, float) and not math.isfinite(v) else v for v in row] for row in rows]
        return {"passed": all(ok for _,ok in checks), "engine": "Local SQL checks / synthetic data", "checks": [{"name": name,"passed":ok} for name,ok in checks], "columns": columns,"rows": serialized_rows}
    except Exception as exc:
        return {"passed": False,"engine": "Local SQL checks / synthetic data", "error": str(exc), "checks": []}
    finally:
        deadline.cancel()
        db.close()
