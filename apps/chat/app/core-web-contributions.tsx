import { FlaskConicalIcon } from "lucide-react";
import type { CoreWebContributions } from "@emi/core/web";
import { healthFitWebContributions } from "@emi/flavor-healthfit/web";

export const healthFitContributions: CoreWebContributions = {
  ...healthFitWebContributions,
  nav: [
    ...(healthFitWebContributions.nav ?? []),
    ...(import.meta.env.DEV
      ? [
          {
            id: "gen-ui",
            label: "Sandbox",
            href: "/gen-ui",
            order: 6,
            icon: FlaskConicalIcon,
            description: "UI playground",
          },
        ]
      : []),
  ],
};
