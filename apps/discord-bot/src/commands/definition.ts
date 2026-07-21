const CommandOptionType = {
  SubCommand: 1,
  String: 3,
} as const;

export const healthfitCommandDefinition = {
  name: "healthfit",
  description: "Emi HealthFit read-only Discord commands",
  options: [
    {
      type: CommandOptionType.SubCommand,
      name: "link",
      description: "Link this Discord account with a Settings-issued code",
      options: [
        {
          type: CommandOptionType.String,
          name: "code",
          description: "One-time link code from Emi HealthFit Settings",
          required: true,
        },
      ],
    },
    {
      type: CommandOptionType.SubCommand,
      name: "summary",
      description: "Recent activity, training, sleep, and sync freshness",
    },
    {
      type: CommandOptionType.SubCommand,
      name: "last-workout",
      description: "Latest Hevy session summary",
    },
    {
      type: CommandOptionType.SubCommand,
      name: "recovery",
      description: "Bounded recovery summary",
    },
    {
      type: CommandOptionType.SubCommand,
      name: "unlink",
      description: "Remove the Discord ↔ HealthFit account link",
    },
  ],
} as const;
