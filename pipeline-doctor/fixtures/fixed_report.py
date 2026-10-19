"""Summarize campaign conversions for the morning marketing report."""


def summarize_campaigns(records):
    campaigns = []
    for record in records:
        campaigns.append({
            "name": record["name"],
            "rate": record["conversions"] / record["clicks"] if record["clicks"] else None,
        })
    eligible = [campaign for campaign in campaigns if campaign["rate"] is not None]
    winner = max(eligible, key=lambda campaign: campaign["rate"]) if eligible else None
    return {
        "campaigns": campaigns,
        "total_conversions": sum(record["conversions"] for record in records),
        "top_campaign": winner["name"] if winner else None,
    }
