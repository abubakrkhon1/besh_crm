export type UserRole =
  | 'owner'
  | 'admin'
  | 'driver'
  | 'general_manager'
  | 'sales_manager'
  | 'sales_agent'
  | 'accounting'
  | 'compliance'
  | 'support'
  | 'marketing';

export type StaffRole = Exclude<UserRole, 'driver'>;
export type SalesRole = 'owner' | 'admin' | 'general_manager' | 'sales_manager' | 'sales_agent';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          auth_user_id: string;
          full_name: string | null;
          email: string | null;
          role: UserRole;
          avatar_url: string | null;
          manager_profile_id: string | null;
          department: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          auth_user_id: string;
          full_name?: string | null;
          email?: string | null;
          role?: UserRole;
          avatar_url?: string | null;
          manager_profile_id?: string | null;
          department?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string;
          full_name?: string | null;
          email?: string | null;
          role?: UserRole;
          avatar_url?: string | null;
          manager_profile_id?: string | null;
          department?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      applications: {
        Row: {
          id: string;
          auth_user_id: string | null;
          status: ApplicationStatus;
          company_legal_name: string;
          doing_business_as: string | null;
          business_phone: string;
          first_name: string;
          last_name: string;
          title: string;
          email: string;
          country: string;
          business_physical_address: string;
          address_line_2: string | null;
          city: string;
          state_province: string;
          postal_code: string;
          total_trucks: number;
          total_drivers: number;
          team_drivers_slip_seat: boolean;
          legal_structure: string;
          business_description: string;
          year_established: number;
          parent_company: string | null;
          promotional_code: string | null;
          taxpayer_id: string;
          business_identifier_type: string | null;
          business_identifier_number: string | null;
          annual_gross_revenue: number | null;
          industry: string;
          account_type: string;
          projected_spend: number;
          payment_method: string;
          days_of_payment: string | null;
          financial_institution: string;
          checking_account_number: string;
          aba_routing_number: string;
          residential_country: string;
          residential_address: string;
          residential_city: string;
          residential_state_province: string;
          residential_postal_code: string;
          social_security_number: string;
          date_of_birth: string;
          residential_phone: string;
          mobile_number: string | null;
          authorized_signer: boolean;
          terms_accepted: boolean;
          submitted_at: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          denial_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id?: string | null;
          status?: ApplicationStatus;
          company_legal_name: string;
          doing_business_as?: string | null;
          business_phone: string;
          first_name: string;
          last_name: string;
          title: string;
          email: string;
          country: string;
          business_physical_address: string;
          address_line_2?: string | null;
          city: string;
          state_province: string;
          postal_code: string;
          total_trucks: number;
          total_drivers: number;
          team_drivers_slip_seat?: boolean;
          legal_structure: string;
          business_description: string;
          year_established: number;
          parent_company?: string | null;
          promotional_code?: string | null;
          taxpayer_id: string;
          business_identifier_type?: string | null;
          business_identifier_number?: string | null;
          annual_gross_revenue?: number | null;
          industry: string;
          account_type: string;
          projected_spend: number;
          payment_method: string;
          days_of_payment?: string | null;
          financial_institution: string;
          checking_account_number: string;
          aba_routing_number: string;
          residential_country: string;
          residential_address: string;
          residential_city: string;
          residential_state_province: string;
          residential_postal_code: string;
          social_security_number: string;
          date_of_birth: string;
          residential_phone: string;
          mobile_number?: string | null;
          authorized_signer?: boolean;
          terms_accepted?: boolean;
          submitted_at?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          denial_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string | null;
          status?: ApplicationStatus;
          company_legal_name?: string;
          doing_business_as?: string | null;
          business_phone?: string;
          first_name?: string;
          last_name?: string;
          title?: string;
          email?: string;
          country?: string;
          business_physical_address?: string;
          address_line_2?: string | null;
          city?: string;
          state_province?: string;
          postal_code?: string;
          total_trucks?: number;
          total_drivers?: number;
          team_drivers_slip_seat?: boolean;
          legal_structure?: string;
          business_description?: string;
          year_established?: number;
          parent_company?: string | null;
          promotional_code?: string | null;
          taxpayer_id?: string;
          business_identifier_type?: string | null;
          business_identifier_number?: string | null;
          annual_gross_revenue?: number | null;
          industry?: string;
          account_type?: string;
          projected_spend?: number;
          payment_method?: string;
          days_of_payment?: string | null;
          financial_institution?: string;
          checking_account_number?: string;
          aba_routing_number?: string;
          residential_country?: string;
          residential_address?: string;
          residential_city?: string;
          residential_state_province?: string;
          residential_postal_code?: string;
          social_security_number?: string;
          date_of_birth?: string;
          residential_phone?: string;
          mobile_number?: string | null;
          authorized_signer?: boolean;
          terms_accepted?: boolean;
          submitted_at?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          denial_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      drivers: {
        Row: {
          id: string;
          customer_id: string;
          auth_user_id: string | null;
          first_name: string;
          last_name: string;
          display_name: string | null;
          email: string | null;
          phone: string | null;
          license_number: string | null;
          license_state: string | null;
          status: 'active' | 'inactive' | 'suspended';
          provider: string;
          external_driver_id: string | null;
          provider_status: string | null;
          onboarding_status: DriverOnboardingStatus;
          invited_at: string | null;
          claimed_at: string | null;
          disabled_at: string | null;
          last_synced_at: string | null;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          auth_user_id?: string | null;
          first_name: string;
          last_name: string;
          display_name?: string | null;
          email?: string | null;
          phone?: string | null;
          license_number?: string | null;
          license_state?: string | null;
          status?: 'active' | 'inactive' | 'suspended';
          provider?: string;
          external_driver_id?: string | null;
          provider_status?: string | null;
          onboarding_status?: DriverOnboardingStatus;
          invited_at?: string | null;
          claimed_at?: string | null;
          disabled_at?: string | null;
          last_synced_at?: string | null;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['drivers']['Insert']>;
      };
      driver_invitations: {
        Row: {
          id: string;
          driver_id: string;
          recipient_email: string;
          token_hash: string;
          status: DriverInvitationStatus;
          expires_at: string;
          sent_at: string | null;
          revoked_at: string | null;
          claimed_at: string | null;
          claimed_by_auth_user_id: string | null;
          delivery_provider_id: string | null;
          delivery_error: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          driver_id: string;
          recipient_email: string;
          token_hash: string;
          status?: DriverInvitationStatus;
          expires_at: string;
          sent_at?: string | null;
          revoked_at?: string | null;
          claimed_at?: string | null;
          claimed_by_auth_user_id?: string | null;
          delivery_provider_id?: string | null;
          delivery_error?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['driver_invitations']['Insert']>;
      };
      leads: {
        Row: {
          id: string;
          company_name: string | null;
          contact_first_name: string;
          contact_last_name: string;
          email: string | null;
          phone: string | null;
          fleet_size: number | null;
          preferred_network: string | null;
          estimated_monthly_gallons: number | null;
          account_type: LeadAccountType;
          priority: LeadPriority;
          status: LeadStatus;
          source: string;
          notes: string | null;
          created_by_profile_id: string;
          assigned_to_profile_id: string | null;
          assigned_at: string | null;
          assigned_by_profile_id: string | null;
          sales_manager_profile_id: string | null;
          application_id: string | null;
          customer_id: string | null;
          successful_at: string | null;
          deal_lost_at: string | null;
          on_the_process_at: string | null;
          follow_up_at: string | null;
          next_follow_up_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_name?: string | null;
          contact_first_name: string;
          contact_last_name: string;
          email?: string | null;
          phone?: string | null;
          fleet_size?: number | null;
          preferred_network?: string | null;
          estimated_monthly_gallons?: number | null;
          account_type?: LeadAccountType;
          priority?: LeadPriority;
          status?: LeadStatus;
          source?: string;
          notes?: string | null;
          created_by_profile_id: string;
          assigned_to_profile_id?: string | null;
          assigned_at?: string | null;
          assigned_by_profile_id?: string | null;
          sales_manager_profile_id?: string | null;
          application_id?: string | null;
          customer_id?: string | null;
          successful_at?: string | null;
          deal_lost_at?: string | null;
          on_the_process_at?: string | null;
          follow_up_at?: string | null;
          next_follow_up_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Database['public']['Tables']['leads']['Row'], 'id'>>;
      };
      lead_activities: {
        Row: LeadActivity;
        Insert: {
          id?: string;
          lead_id: string;
          actor_profile_id?: string | null;
          actor_name?: string | null;
          activity_type: LeadActivityType;
          description: string;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: never;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
    };
  };
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

export type ApplicationStatus = 'pending' | 'under_review' | 'needs_documents' | 'approved' | 'denied';
export type Application = Database['public']['Tables']['applications']['Row'];
export type ApplicationInsert = Database['public']['Tables']['applications']['Insert'];
export type ApplicationUpdate = Database['public']['Tables']['applications']['Update'];

export type DriverOnboardingStatus = 'unclaimed' | 'invited' | 'active' | 'disabled';
export type DriverInvitationStatus = 'pending' | 'sent' | 'delivery_failed' | 'claimed' | 'revoked' | 'expired';
export type Driver = Database['public']['Tables']['drivers']['Row'];
export type DriverInvitation = Database['public']['Tables']['driver_invitations']['Row'];

export type ApplicationDocumentRequestStatus = 'requested' | 'uploaded' | 'accepted' | 'rejected';
export type ApplicationDocumentReviewStatus = 'uploaded' | 'accepted' | 'rejected';

export interface ApplicationDocumentRequest {
  id: string;
  application_id: string;
  document_type: string;
  label: string;
  instructions: string | null;
  is_required: boolean;
  due_at: string | null;
  status: ApplicationDocumentRequestStatus;
  requested_by_profile_id: string;
  requested_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationDocument {
  id: string;
  application_id: string;
  request_id: string;
  storage_path: string;
  original_filename: string;
  mime_type: 'application/pdf' | 'image/jpeg' | 'image/png';
  size_bytes: number;
  submitted_by: 'applicant' | 'staff';
  uploaded_by_profile_id: string | null;
  review_status: ApplicationDocumentReviewStatus;
  rejection_reason: string | null;
  reviewed_by_profile_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}
export type LeadStatus = 'new' | 'successful' | 'deal_lost' | 'on_the_process' | 'follow_up';
export type LeadAccountType = 'prepaid_account' | 'deposit' | 'credit_line';
export type LeadPriority = 'low' | 'normal' | 'high' | 'urgent';
export type LeadActivityType = 'lead_created' | 'assigned' | 'reassigned' | 'unassigned' | 'status_changed' | 'work_plan_updated' | 'note_added';
export interface LeadActivity {
  id: string;
  lead_id: string;
  actor_profile_id: string | null;
  actor_name: string | null;
  activity_type: LeadActivityType;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
export type Lead = Database['public']['Tables']['leads']['Row'];
export type LeadInsert = Database['public']['Tables']['leads']['Insert'];
