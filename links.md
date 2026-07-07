https://github.com/awesome-selfhosted/awesome-selfhosted?tab=readme-ov-file#health-and-fitness

https://github.com/krumjahn/applehealth / https://rumjahn.com/how-i-used-a-i-to-analyze-8-years-of-apple-health-fitness-data-to-uncover-actionable-insights/

https://apps.apple.com/in/app/health-data-export/id6758620223 Set-and-forget Apple Health data exports (100% Free & Automated)

https://github.com/utsaaham/arogyamandiram

https://vitalina.app/export/heart-rate

https://github.com/friebetill/apple-health-to-obsidian

https://github.com/sandseb123/Leo-Health-Core

https://www.reddit.com/r/AppleWatch/comments/1umcgnn/how_do_you_explore_your_apple_health_data/

https://www.reddit.com/r/selfhosted/comments/1rglasn/localfirst_apple_health_dashboard_sqlite/

https://www.reddit.com/r/OpenAI/comments/1lwv7jz/built_an_app_to_export_apple_health_chatgpt/

https://healthexport.app/

https://www.aihealthexport.com/guides/best-apple-health-export-apps

https://lode.health/

https://apps.apple.com/us/app/simple-health-export-csv/id1535380115

---

https://www.reddit.com/r/shortcuts/comments/k2hvp1/automated_daily_export_of_health_data_to_google/

This can be done with a personal automation. The trigger is “time of day.”

You can use the Find Health Samples action to pull data from health, then use the Get Contents of URL action with request parameters to trigger a call to an IFTTT or Integromat webhook. That webhook starts an applet/integration, which logs the data you uploaded to a Google Sheet. (Depending on how much data there is, Integromat might be the better option.)

---

https://www.reddit.com/r/sleep/comments/1swc0b7/how_to_export_apple_health_sleep_data_for_ai/

Option 2: Apple Shortcuts

You can also build a Shortcut using "Find Health Samples" for sleep records. From there you can filter by date range or sleep stage and output the result as JSON, CSV, or Markdown.

This is probably the cleaner native route, but I didn’t even know it existed at first. It also takes some setup, and formatting the output nicely for an LLM can be fiddly if you just want to get the data and move on.

---

https://apps.apple.com/us/app/health-export-kit/id6762845329
