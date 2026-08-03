# OpenAI chat model catalog

The HealthFit picker reads its model choices and standard token prices from [`apps/chat/app/models.json`](../apps/chat/app/models.json). The catalog is checked in so the app does not depend on OpenAI documentation being reachable at runtime.

Prices use OpenAI's standard short-context, uncached input and output rates. The usage estimate does not distinguish cached tokens, so it remains an approximation.

## Refresh the catalog

Run the check periodically:

```sh
pnpm models:check
```

When prices or current GPT-5.x Sol/Terra/Luna tiers change, update the checked-in values from the official table:

```sh
pnpm models:update
```

Review the resulting diff and run the chat tests before shipping. The updater preserves the product-facing labels, descriptions, and capability flags. If OpenAI publishes a new GPT tier matching the current naming pattern, the check reports it as missing so a human can choose its picker metadata before adding it.

The default is GPT-5.6 Terra: OpenAI describes it as the balance of intelligence and cost for everyday work. GPT-5.6 Sol remains available for complex work, GPT-5.6 Luna for cost-sensitive workloads, and GPT-4o mini as a low-cost fallback.

Official sources: [model selection](https://developers.openai.com/api/docs/guides/model-selection), [model catalog](https://developers.openai.com/api/docs/models), and [API pricing](https://developers.openai.com/api/docs/pricing).
