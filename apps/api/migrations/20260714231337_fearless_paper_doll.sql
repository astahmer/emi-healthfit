CREATE INDEX IF NOT EXISTS `idx_chat_generations_retention` ON `chat_generations` (`status`,`updated_at`);
