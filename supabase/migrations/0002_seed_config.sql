insert into config (id, data) values (1, '{
  "sectors": ["Fintech","B2B SaaS","AI/ML","Healthtech","Climate/EV","D2C"],
  "taxonomy": ["Fintech","B2B SaaS","AI/ML","Healthtech","Climate/EV","D2C","Edtech","Logistics","Ecommerce","Deeptech","Consumer","Gaming","Agritech","Other"],
  "stages": ["SEED","PRE_SERIES_A","SERIES_A"],
  "chequeMinUsd": 500000, "chequeMaxUsd": 15000000,
  "weights": {"sector":3,"stage":3,"watchlist":20,"adjacency":12,"cheque":2,"conf":{"CONFIRMED":1.2,"SINGLE_SOURCE":1,"LOW":0.6,"RUMOURED":0.4}},
  "emailRecipients": [], "briefSendTime": "06:00 IST", "disabledSources": [], "inrPerUsdFallback": 88
}') on conflict (id) do nothing;
