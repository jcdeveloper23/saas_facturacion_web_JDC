/**
 * Organization Interfaces - Multi-tenant SaaS Platform
 * Aligned with backend model: backGps/src/services/organizations/models/
 */

// =============================================================================
// ORGANIZATION
// =============================================================================

export interface Organization {
  id?: number;

  // Basic Information
  name: string;
  short_name?: string;
  slug?: string;
  tax_document?: string;

  // Address & Location
  address?: string;
  country?: string;
  city_id?: number;
  city?: City;  // Populated relation
  province?: string;
  zip_code?: string;

  // Contact Information
  email: string;
  phone?: string;
  website?: string;

  // Primary Contact
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_position?: string;
  general_manager?: string;

  // Configuration & Localization
  working_hours?: string;
  language: string;
  timezone: string;
  currency_code: string;

  // Branding
  logo?: string;
  slogan?: string;
  primary_color?: string;
  secondary_color?: string;
  favicon_url?: string;
  custom_domain?: string;

  // Billing
  billing_email?: string;
  invoice_footer?: string;

  // Plan & Subscription
  plan: OrganizationPlan;
  plan_started_at?: string;
  plan_expires_at?: string;
  subscription?: Subscription;  // Relation

  // Resource Limits (from plan or custom)
  max_devices: number;
  max_users: number;
  max_api_calls_per_month: number;

  // API Access
  api_key?: string;
  api_secret?: string;
  webhook_url?: string;

  // Usage Statistics (real-time)
  devices_count: number;
  users_count: number;
  api_calls_this_month: number;
  last_api_call_at?: string;

  // Status
  is_active: boolean;
  is_verified: boolean;
  verified_at?: string;
  start_of_activities?: string;

  // Onboarding
  onboarding_completed?: boolean;
  onboarding_step?: number;

  // Referral
  referred_by_organization_id?: number;
  referral_code?: string;

  // Support
  support_tier?: SupportTier;
  account_manager_user_id?: number;

  // Internal (super_admin only)
  internal_notes?: string;
  health_score?: number;

  // Timestamps
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
}

// =============================================================================
// ORGANIZATION LIMITS (Custom overrides)
// =============================================================================

export interface OrganizationLimits {
  id?: number;
  organization_id: number;

  // Custom Limits
  custom_max_devices?: number;
  custom_max_users?: number;
  custom_max_api_calls_per_month?: number;
  custom_storage_gb?: number;
  custom_reports_per_month?: number;

  // Feature Flags
  feature_real_time_tracking: boolean;
  feature_geofences: boolean;
  feature_alerts: boolean;
  feature_reports: boolean;
  feature_api_access: boolean;
  feature_white_label: boolean;
  feature_custom_integrations: boolean;

  // Metadata
  notes?: string;
  applied_at?: string;
  expires_at?: string;

  created_at?: string;
  updated_at?: string;
}

// =============================================================================
// PLANS (Catalog)
// =============================================================================

export interface Plan {
  id?: number;
  code: string;
  name: string;
  description?: string;

  // Pricing
  price_monthly: number;
  price_yearly: number;
  currency: string;

  // Limits
  max_devices: number;
  max_users: number;
  max_geofences: number;
  max_routes: number;
  max_alerts: number;
  max_api_calls_per_month: number;
  max_storage_gb: number;
  data_retention_days: number;

  // Features
  features: PlanFeatures;

  // Configuration
  trial_days: number;
  is_public: boolean;
  is_popular: boolean;
  sort_order: number;

  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PlanFeatures {
  real_time_tracking: boolean;
  geofences: boolean;
  alerts: boolean;
  reports: boolean;
  api_access: boolean;
  white_label: boolean;
  custom_integrations: boolean;
  priority_support: boolean;
  dedicated_account_manager: boolean;
  sla_guarantee?: string;
}

// =============================================================================
// SUBSCRIPTIONS
// =============================================================================

export interface Subscription {
  id?: number;
  organization_id: number;
  plan_id: number;
  plan?: Plan;  // Relation

  // Status
  status: SubscriptionStatus;

  // Dates
  trial_started_at?: string;
  trial_ends_at?: string;
  activated_at?: string;
  current_period_start?: string;
  current_period_end?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  suspended_at?: string;
  suspension_reason?: string;

  // Billing
  billing_cycle: BillingCycle;
  next_billing_date?: string;
  amount: number;
  currency: string;

  // Discounts
  discount_percent: number;
  discount_ends_at?: string;
  coupon_code?: string;

  // Payment
  payment_method: PaymentMethod;
  payment_gateway_customer_id?: string;
  payment_gateway_subscription_id?: string;

  // Options
  auto_renew: boolean;
  invoice_notes?: string;

  // Custom limits (override plan)
  custom_limits?: Partial<PlanLimits>;

  created_at?: string;
  updated_at?: string;
}

export interface PlanLimits {
  max_devices: number;
  max_users: number;
  max_geofences: number;
  max_api_calls_per_month: number;
  max_storage_gb: number;
}

// =============================================================================
// INVOICES
// =============================================================================

export interface Invoice {
  id?: number;
  organization_id: number;
  subscription_id?: number;

  invoice_number: string;

  // Amounts
  subtotal: number;
  tax_percent: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  currency: string;

  // Status
  status: InvoiceStatus;

  // Dates
  issued_at: string;
  due_date: string;
  paid_at?: string;

  // Period
  period_start: string;
  period_end: string;

  // Details
  line_items: InvoiceLineItem[];

  // Payment
  payment_method?: string;
  payment_reference?: string;

  // PDF
  pdf_url?: string;

  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

// =============================================================================
// USAGE TRACKING
// =============================================================================

export interface OrganizationUsage {
  id?: number;
  organization_id: number;
  year: number;
  month: number;

  // Counters
  api_calls: number;
  devices_active: number;
  users_active: number;
  storage_used_mb: number;
  gps_positions_received: number;
  reports_generated: number;
  alerts_sent: number;

  // Overages
  exceeded_api_calls: number;
  exceeded_devices: number;
  exceeded_storage_mb: number;

  // Engagement
  active_days: number;
  unique_users_active: number;
  avg_session_duration_minutes: number;

  calculated_at?: string;
  created_at?: string;
  updated_at?: string;
}

// =============================================================================
// PLAN HISTORY (Audit)
// =============================================================================

export interface OrganizationPlanHistory {
  id?: number;
  organization_id: number;

  previous_plan: OrganizationPlan;
  new_plan: OrganizationPlan;
  change_reason: PlanChangeReason;
  changed_by_user_id?: number;

  previous_limits?: PlanLimits;
  new_limits?: PlanLimits;

  notes?: string;
  created_at?: string;
}

// =============================================================================
// STATISTICS & DASHBOARD
// =============================================================================

export interface OrganizationStats {
  // Counts
  total_devices: number;
  active_devices: number;
  total_users: number;
  active_users: number;
  total_geofences: number;
  total_alerts: number;

  // Usage vs Limits
  devices_usage_percent: number;
  users_usage_percent: number;
  api_usage_percent: number;
  storage_usage_percent: number;

  // This month
  api_calls_this_month: number;
  positions_this_month: number;
  alerts_this_month: number;

  // Trends (vs last month)
  devices_trend: number;  // +5 or -2
  users_trend: number;
  api_calls_trend: number;

  // Health
  health_score: number;
  days_until_limit?: number;  // null if not near limit
}

export interface OrganizationDashboard {
  organization: Organization;
  subscription?: Subscription;
  limits: OrganizationLimits;
  stats: OrganizationStats;
  usage_history: OrganizationUsage[];
  recent_invoices: Invoice[];
  plan_history: OrganizationPlanHistory[];
}

// =============================================================================
// ENUMS & TYPES
// =============================================================================

export type OrganizationPlan = 'free' | 'starter' | 'business' | 'enterprise';

export type SubscriptionStatus =
  | 'trial'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'cancelled'
  | 'expired';

export type BillingCycle = 'monthly' | 'yearly';

export type PaymentMethod = 'card' | 'paypal' | 'bank_transfer' | 'manual';

export type InvoiceStatus =
  | 'draft'
  | 'pending'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'refunded';

export type PlanChangeReason =
  | 'upgrade'
  | 'downgrade'
  | 'renewal'
  | 'trial_ended'
  | 'admin_change';

export type SupportTier = 'standard' | 'priority' | 'dedicated';

// =============================================================================
// FILTERS & QUERIES
// =============================================================================

export interface OrganizationFilters {
  plan?: OrganizationPlan;
  is_active?: boolean;
  is_verified?: boolean;
  subscription_status?: SubscriptionStatus;
  country?: string;
  search?: string;
  created_after?: string;
  created_before?: string;
}

export interface OrganizationSort {
  field: 'name' | 'created_at' | 'devices_count' | 'users_count' | 'plan';
  direction: 'asc' | 'desc';
}

// =============================================================================
// FORM DATA
// =============================================================================

export interface OrganizationCreateInput {
  // Basic Info
  name: string;
  short_name?: string;
  email: string;
  phone?: string;
  website?: string;
  tax_document?: string;

  // Location
  country?: string;
  province?: string;
  city_id?: number;
  address?: string;
  zip_code?: string;

  // Contact
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_position?: string;
  general_manager?: string;

  // Configuration
  language?: string;
  timezone?: string;
  currency_code?: string;
  working_hours?: string;

  // Branding
  logo?: string;
  slogan?: string;
  primary_color?: string;
  secondary_color?: string;

  // Plan
  plan?: OrganizationPlan;
  max_devices?: number;
  max_users?: number;
  max_api_calls_per_month?: number;
  trial_days?: number;

  // Billing
  billing_email?: string;
  invoice_footer?: string;

  // API
  webhook_url?: string;
}

export interface OrganizationUpdateInput {
  // Basic Info
  name?: string;
  short_name?: string;
  email?: string;
  phone?: string;
  website?: string;
  tax_document?: string;

  // Location
  address?: string;
  country?: string;
  city_id?: number;
  province?: string;
  zip_code?: string;

  // Contact
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_position?: string;
  general_manager?: string;

  // Configuration
  working_hours?: string;
  language?: string;
  timezone?: string;
  currency_code?: string;

  // Branding
  logo?: string;
  slogan?: string;
  primary_color?: string;
  secondary_color?: string;

  // Plan Limits (can be updated)
  max_devices?: number;
  max_users?: number;
  max_api_calls_per_month?: number;

  // Billing
  billing_email?: string;
  invoice_footer?: string;

  // API
  webhook_url?: string;

  // Status
  is_active?: boolean;
}

export interface PlanChangeInput {
  plan_id: number;
  effective_immediately?: boolean;
  custom_limits?: Partial<PlanLimits>;
  notes?: string;
}

// =============================================================================
// HELPER / RELATED
// =============================================================================

export interface City {
  id: number;
  name: string;
  state?: string;
  country?: string;
}

// Plan badge colors for UI
export const PLAN_COLORS: Record<OrganizationPlan, string> = {
  free: 'secondary',
  starter: 'info',
  business: 'primary',
  enterprise: 'warning'
};

// Subscription status badges for UI
export const SUBSCRIPTION_STATUS_COLORS: Record<SubscriptionStatus, string> = {
  trial: 'info',
  active: 'success',
  past_due: 'warning',
  suspended: 'danger',
  cancelled: 'dark',
  expired: 'secondary'
};

// Invoice status badges for UI
export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: 'secondary',
  pending: 'warning',
  paid: 'success',
  overdue: 'danger',
  cancelled: 'dark',
  refunded: 'info'
};
