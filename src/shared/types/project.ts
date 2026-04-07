export interface Project {
  id: string
  name: string
  path: string
  description: string | null
  tags: string | null
  language: string | null
  custom_icon: string | null
  setup_script: string | null
  run_script: string | null
  archive_script: string | null
  auto_assign_port: boolean
  default_agent_sdk: string | null
  default_model_provider_id: string | null
  default_model_id: string | null
  default_model_variant: string | null
  env_vars: string | null
  sdk_configs: string | null
  sort_order: number
  created_at: string
  last_accessed_at: string
}
