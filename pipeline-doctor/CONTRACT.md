# Campaign report contract

The module campaign_report.py exports summarize_campaigns(records).
Input is a list of dicts with name (string), clicks and conversions (nonnegative
numbers). The caller supplies validated data. Do not mutate input.

Return a dict with:
- campaigns: same order and count as input, each containing name and rate.
- rate: conversions / clicks; use None when clicks == 0 (the rate is undefined).
- total_conversions: sum of all input conversions.
- top_campaign: name with greatest defined rate. First input wins a tie.
  Return None when there are no campaigns with a defined rate.

An empty list returns empty campaigns, zero total_conversions and None top_campaign.
No file/network access or external dependencies are needed. Fix the implementation
without changing this contract. Preserve all ordinary-input behavior.
