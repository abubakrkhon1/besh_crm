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
          auth_user_id: string;
          status: 'pending' | 'approved' | 'denied';
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
          auth_user_id: string;
          status?: 'pending' | 'approved' | 'denied';
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
          auth_user_id?: string;
          status?: 'pending' | 'approved' | 'denied';
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
          status: LeadStatus;
          source: string;
          notes: string | null;
          created_by_profile_id: string;
          assigned_to_profile_id: string | null;
          sales_manager_profile_id: string | null;
          application_id: string | null;
          customer_id: string | null;
          successful_at: string | null;
          deal_lost_at: string | null;
          on_the_process_at: string | null;
          follow_up_at: string | null;
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
          status?: LeadStatus;
          source?: string;
          notes?: string | null;
          created_by_profile_id: string;
          assigned_to_profile_id?: string | null;
          sales_manager_profile_id?: string | null;
          application_id?: string | null;
          customer_id?: string | null;
          successful_at?: string | null;
          deal_lost_at?: string | null;
          on_the_process_at?: string | null;
          follow_up_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Database['public']['Tables']['leads']['Row'], 'id'>>;
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

export type ApplicationStatus = 'pending' | 'approved' | 'denied';
export type Application = Database['public']['Tables']['applications']['Row'];
export type ApplicationInsert = Database['public']['Tables']['applications']['Insert'];
export type ApplicationUpdate = Database['public']['Tables']['applications']['Update'];
export type LeadStatus = 'new' | 'successful' | 'deal_lost' | 'on_the_process' | 'follow_up';
export type LeadAccountType = 'prepaid_account' | 'deposit' | 'credit_line';
export type Lead = Database['public']['Tables']['leads']['Row'];
export type LeadInsert = Database['public']['Tables']['leads']['Insert'];
