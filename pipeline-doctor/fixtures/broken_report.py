"""Summarize campaign conversions for the morning marketing report."""


def summarize_campaigns(records):
    campaigns = []
    for record in records:
        campaigns.append({
            "name": record["name"],
            "rate": record["conversions"] / record["clicks"],
        })
    winner = max(campaigns, key=lambda campaign: campaign["rate"])
    return {
        "campaigns": campaigns,
        "total_conversions": sum(record["conversions"] for record in records),
        "top_campaign": winner["name"],
    }
