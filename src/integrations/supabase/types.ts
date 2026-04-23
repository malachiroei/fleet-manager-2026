export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      compliance_alerts: {
        Row: {
          alert_type: string
          created_at: string
          email_sent: boolean | null
          entity_id: string
          entity_type: string
          expiry_date: string
          id: string
          status: Database["public"]["Enums"]["compliance_status"]
          updated_at: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          email_sent?: boolean | null
          entity_id: string
          entity_type: string
          expiry_date: string
          id?: string
          status?: Database["public"]["Enums"]["compliance_status"]
          updated_at?: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          email_sent?: boolean | null
          entity_id?: string
          entity_type?: string
          expiry_date?: string
          id?: string
          status?: Database["public"]["Enums"]["compliance_status"]
          updated_at?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          category: string | null
          description: string | null
          display_name_he: string | null
          feature_key: string
          id: string
          is_enabled_globally: boolean
        }
        Insert: {
          category?: string | null
          description?: string | null
          display_name_he?: string | null
          feature_key: string
          id?: string
          is_enabled_globally?: boolean
        }
        Update: {
          category?: string | null
          description?: string | null
          display_name_he?: string | null
          feature_key?: string
          id?: string
          is_enabled_globally?: boolean
        }
        Relationships: []
      }
      driver_documents: {
        Row: {
          created_at: string
          driver_id: string
          file_url: string
          id: string
          title: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          file_url: string
          id?: string
          title: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          file_url?: string
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_documents_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_vehicle_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          created_at: string
          driver_id: string | null
          id: string
          notes: string | null
          unassigned_at: string | null
          vehicle_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          driver_id?: string | null
          id?: string
          notes?: string | null
          unassigned_at?: string | null
          vehicle_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          driver_id?: string | null
          id?: string
          notes?: string | null
          unassigned_at?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_vehicle_assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_vehicle_assignments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          address: string | null
          area: string | null
          city: string | null
          created_at: string
          department: string | null
          division: string | null
          driver_code: string | null
          eligibility: string | null
          email: string | null
          employee_number: string | null
          full_name: string
          group_code: string | null
          group_name: string | null
          health_declaration_date: string | null
          health_declaration_url: string | null
          id: string
          id_number: string
          is_active: boolean
          job_title: string | null
          license_back_url: string | null
          license_expiry: string
          license_front_url: string | null
          license_number: string | null
          note1: string | null
          note2: string | null
          phone: string | null
          rating: string | null
          regulation_585b_date: string | null
          safety_training_date: string | null
          status: Database["public"]["Enums"]["compliance_status"]
          updated_at: string
          user_id: string | null
          work_start_date: string | null
          managed_by_user_id: string | null
        }
        Insert: {
          address?: string | null
          area?: string | null
          city?: string | null
          created_at?: string
          department?: string | null
          division?: string | null
          driver_code?: string | null
          eligibility?: string | null
          email?: string | null
          employee_number?: string | null
          full_name: string
          managed_by_user_id?: string | null
          group_code?: string | null
          group_name?: string | null
          health_declaration_date?: string | null
          health_declaration_url?: string | null
          id?: string
          id_number: string
          is_active?: boolean
          job_title?: string | null
          license_back_url?: string | null
          license_expiry: string
          license_front_url?: string | null
          license_number?: string | null
          note1?: string | null
          note2?: string | null
          phone?: string | null
          rating?: string | null
          regulation_585b_date?: string | null
          safety_training_date?: string | null
          status?: Database["public"]["Enums"]["compliance_status"]
          updated_at?: string
          user_id?: string | null
          work_start_date?: string | null
        }
        Update: {
          address?: string | null
          area?: string | null
          city?: string | null
          created_at?: string
          department?: string | null
          division?: string | null
          driver_code?: string | null
          eligibility?: string | null
          email?: string | null
          employee_number?: string | null
          full_name?: string
          managed_by_user_id?: string | null
          group_code?: string | null
          group_name?: string | null
          health_declaration_date?: string | null
          health_declaration_url?: string | null
          id?: string
          id_number?: string
          is_active?: boolean
          job_title?: string | null
          license_back_url?: string | null
          license_expiry?: string
          license_front_url?: string | null
          license_number?: string | null
          note1?: string | null
          note2?: string | null
          phone?: string | null
          rating?: string | null
          regulation_585b_date?: string | null
          safety_training_date?: string | null
          status?: Database["public"]["Enums"]["compliance_status"]
          updated_at?: string
          user_id?: string | null
          work_start_date?: string | null
          managed_by_user_id?: string | null
        }
        Relationships: []
      }
      maintenance_logs: {
        Row: {
          cost: number | null
          created_at: string
          created_by: string | null
          garage_name: string | null
          id: string
          invoice_url: string | null
          notes: string | null
          odometer_reading: number
          service_date: string
          service_type: string
          vehicle_id: string
        }
        Insert: {
          cost?: number | null
          created_at?: string
          created_by?: string | null
          garage_name?: string | null
          id?: string
          invoice_url?: string | null
          notes?: string | null
          odometer_reading: number
          service_date: string
          service_type: string
          vehicle_id: string
        }
        Update: {
          cost?: number | null
          created_at?: string
          created_by?: string | null
          garage_name?: string | null
          id?: string
          invoice_url?: string | null
          notes?: string | null
          odometer_reading?: number
          service_date?: string
          service_type?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_data: {
        Row: {
          adjusted_price: number | null
          commercial_name: string | null
          created_at: string
          drive_type: string | null
          effective_date: string | null
          engine_volume_cc: number | null
          fuel_type: string | null
          green_score: number | null
          id: string
          is_automatic: boolean | null
          list_price: number | null
          manufacturer_code: string
          manufacturer_name: string | null
          model_code: string
          model_description: string | null
          pollution_level: number | null
          registration_year: number | null
          updated_at: string
          usage_value: number | null
          usage_year: number | null
          vehicle_type_code: string | null
          weight: number | null
        }
        Insert: {
          adjusted_price?: number | null
          commercial_name?: string | null
          created_at?: string
          drive_type?: string | null
          effective_date?: string | null
          engine_volume_cc?: number | null
          fuel_type?: string | null
          green_score?: number | null
          id?: string
          is_automatic?: boolean | null
          list_price?: number | null
          manufacturer_code: string
          manufacturer_name?: string | null
          model_code: string
          model_description?: string | null
          pollution_level?: number | null
          registration_year?: number | null
          updated_at?: string
          usage_value?: number | null
          usage_year?: number | null
          vehicle_type_code?: string | null
          weight?: number | null
        }
        Update: {
          adjusted_price?: number | null
          commercial_name?: string | null
          created_at?: string
          drive_type?: string | null
          effective_date?: string | null
          engine_volume_cc?: number | null
          fuel_type?: string | null
          green_score?: number | null
          id?: string
          is_automatic?: boolean | null
          list_price?: number | null
          manufacturer_code?: string
          manufacturer_name?: string | null
          model_code?: string
          model_description?: string | null
          pollution_level?: number | null
          registration_year?: number | null
          updated_at?: string
          usage_value?: number | null
          usage_year?: number | null
          vehicle_type_code?: string | null
          weight?: number | null
        }
        Relationships: []
      }
      procedure6_complaints: {
        Row: {
          action_taken: string | null
          created_at: string
          description: string | null
          driver_name: string | null
          driver_response: string | null
          first_update_time: string | null
          id: string
          last_update_time: string | null
          location: string | null
          received_time: string | null
          receiver_name: string | null
          report_date_time: string | null
          report_id: string | null
          report_type: string | null
          reporter_cell_phone: string | null
          reporter_name: string | null
          status: string
          updated_at: string
          vehicle_number: string
        }
        Insert: {
          action_taken?: string | null
          created_at?: string
          description?: string | null
          driver_name?: string | null
          driver_response?: string | null
          first_update_time?: string | null
          id?: string
          last_update_time?: string | null
          location?: string | null
          received_time?: string | null
          receiver_name?: string | null
          report_date_time?: string | null
          report_id?: string | null
          report_type?: string | null
          reporter_cell_phone?: string | null
          reporter_name?: string | null
          status?: string
          updated_at?: string
          vehicle_number: string
        }
        Update: {
          action_taken?: string | null
          created_at?: string
          description?: string | null
          driver_name?: string | null
          driver_response?: string | null
          first_update_time?: string | null
          id?: string
          last_update_time?: string | null
          location?: string | null
          received_time?: string | null
          receiver_name?: string | null
          report_date_time?: string | null
          report_id?: string | null
          report_type?: string | null
          reporter_cell_phone?: string | null
          reporter_name?: string | null
          status?: string
          updated_at?: string
          vehicle_number?: string
        }
        Relationships: []
      }
      /**
       * profiles: מפתח ראשי = id (תואם auth.users.id / auth.uid()).
       * סינון באפליקציה — רק .eq('id', user.id), לא user_id.
       * user_id בעמודות: אופציונלי/legacy; ייתכן NULL ב-DB.
       */
      profiles: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          full_name: string
          email: string | null
          phone: string | null
          org_id: string | null
          managed_by_user_id: string | null
          /** מנהל ישיר בהיררכיה; null = ללא הורה */
          parent_admin_id: string | null
          permissions: Json | null
          status: string
          is_system_admin: boolean | null
          current_app_version: string | null
          target_version: string | null
          /** Per-user UI feature tokens (UI_FEATURE_*) in addition to global manifest */
          allowed_features: Json | null
          /** Per-user UI_FEATURE_* deny list (overrides manifest + grants); optional migration */
          denied_features: Json | null
          /** Manifest version when UI permissions were saved — personal denies apply only after user ack ≥ this */
          ui_denied_features_anchor_version: string | null
          /** legacy; may be null — use id for joins and RLS */
          user_id: string | null
        }
        Insert: {
          id: string
          full_name: string
          email?: string | null
          phone?: string | null
          org_id?: string | null
          managed_by_user_id?: string | null
          parent_admin_id?: string | null
          permissions?: Json | null
          status?: string
          is_system_admin?: boolean | null
          current_app_version?: string | null
          target_version?: string | null
          allowed_features?: Json | null
          denied_features?: Json | null
          ui_denied_features_anchor_version?: string | null
          created_at?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          id?: string
          full_name?: string
          email?: string | null
          phone?: string | null
          org_id?: string | null
          managed_by_user_id?: string | null
          parent_admin_id?: string | null
          permissions?: Json | null
          status?: string
          is_system_admin?: boolean | null
          current_app_version?: string | null
          target_version?: string | null
          allowed_features?: Json | null
          denied_features?: Json | null
          ui_denied_features_anchor_version?: string | null
          created_at?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      maintenance_records: {
        Row: {
          id: string
          created_at: string
          vehicle_id: string
          service_type: string
          odometer: number
          date: string
          notes: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          vehicle_id: string
          service_type: string
          odometer: number
          date: string
          notes?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          vehicle_id?: string
          service_type?: string
          odometer?: number
          date?: string
          notes?: string | null
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_records_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_handovers: {
        Row: {
          created_at: string
          created_by: string | null
          driver_id: string | null
          fuel_level: number
          handover_date: string
          handover_type: string
          id: string
          notes: string | null
          odometer_reading: number
          photo_back_url: string | null
          photo_front_url: string | null
          photo_left_url: string | null
          photo_right_url: string | null
          signature_url: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          fuel_level: number
          handover_date?: string
          handover_type: string
          id?: string
          notes?: string | null
          odometer_reading: number
          photo_back_url?: string | null
          photo_front_url?: string | null
          photo_left_url?: string | null
          photo_right_url?: string | null
          signature_url?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          fuel_level?: number
          handover_date?: string
          handover_type?: string
          id?: string
          notes?: string | null
          odometer_reading?: number
          photo_back_url?: string | null
          photo_front_url?: string | null
          photo_left_url?: string | null
          photo_right_url?: string | null
          signature_url?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_handovers_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_handovers_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          adjusted_price: number | null
          assigned_driver_id: string | null
          managed_by_user_id: string | null
          base_index: number | null
          chassis_number: string | null
          color: string | null
          commercial_name: string | null
          created_at: string
          current_odometer: number
          drive_type: string | null
          driver_code: string | null
          effective_date: string | null
          engine_volume: string | null
          fuel_type: string | null
          green_score: number | null
          group_name: string | null
          id: string
          ignition_code: string | null
          insurance_expiry: string
          insurance_pdf_url: string | null
          internal_number: string | null
          is_active: boolean
          is_automatic: boolean | null
          last_odometer_date: string | null
          leasing_company_name: string | null
          license_image_url: string | null
          list_price: number | null
          mandatory_end_date: string | null
          manufacturer: string
          manufacturer_code: string | null
          model: string
          model_code: string | null
          model_description: string | null
          monthly_total_cost: number | null
          next_alert_km: number | null
          next_maintenance_date: string | null
          next_maintenance_km: number | null
          odometer_diff_maintenance: number | null
          ownership_type: string | null
          pascal: string | null
          pickup_date: string | null
          plate_number: string
          pollution_level: number | null
          road_ascent_month: number | null
          road_ascent_year: number | null
          sale_date: string | null
          service_interval_km: number | null
          status: Database["public"]["Enums"]["compliance_status"]
          tax_value_price: number | null
          tax_year: number | null
          test_expiry: string
          updated_at: string
          upgrade_addition: number | null
          vehicle_budget: number | null
          vehicle_type_code: string | null
          vehicle_type_name: string | null
          weight: number | null
          year: number
        }
        Insert: {
          adjusted_price?: number | null
          assigned_driver_id?: string | null
          managed_by_user_id?: string | null
          base_index?: number | null
          chassis_number?: string | null
          color?: string | null
          commercial_name?: string | null
          created_at?: string
          current_odometer?: number
          drive_type?: string | null
          driver_code?: string | null
          effective_date?: string | null
          engine_volume?: string | null
          fuel_type?: string | null
          green_score?: number | null
          group_name?: string | null
          id?: string
          ignition_code?: string | null
          insurance_expiry: string
          insurance_pdf_url?: string | null
          internal_number?: string | null
          is_active?: boolean
          is_automatic?: boolean | null
          last_odometer_date?: string | null
          leasing_company_name?: string | null
          license_image_url?: string | null
          list_price?: number | null
          mandatory_end_date?: string | null
          manufacturer: string
          manufacturer_code?: string | null
          model: string
          model_code?: string | null
          model_description?: string | null
          monthly_total_cost?: number | null
          next_alert_km?: number | null
          next_maintenance_date?: string | null
          next_maintenance_km?: number | null
          odometer_diff_maintenance?: number | null
          ownership_type?: string | null
          pascal?: string | null
          pickup_date?: string | null
          plate_number: string
          pollution_level?: number | null
          road_ascent_month?: number | null
          road_ascent_year?: number | null
          sale_date?: string | null
          service_interval_km?: number | null
          status?: Database["public"]["Enums"]["compliance_status"]
          tax_value_price?: number | null
          tax_year?: number | null
          test_expiry: string
          updated_at?: string
          upgrade_addition?: number | null
          vehicle_budget?: number | null
          vehicle_type_code?: string | null
          vehicle_type_name?: string | null
          weight?: number | null
          year: number
        }
        Update: {
          adjusted_price?: number | null
          assigned_driver_id?: string | null
          managed_by_user_id?: string | null
          base_index?: number | null
          chassis_number?: string | null
          color?: string | null
          commercial_name?: string | null
          created_at?: string
          current_odometer?: number
          drive_type?: string | null
          driver_code?: string | null
          effective_date?: string | null
          engine_volume?: string | null
          fuel_type?: string | null
          green_score?: number | null
          group_name?: string | null
          id?: string
          ignition_code?: string | null
          insurance_expiry?: string
          insurance_pdf_url?: string | null
          internal_number?: string | null
          is_active?: boolean
          is_automatic?: boolean | null
          last_odometer_date?: string | null
          leasing_company_name?: string | null
          license_image_url?: string | null
          list_price?: number | null
          mandatory_end_date?: string | null
          manufacturer?: string
          manufacturer_code?: string | null
          model?: string
          model_code?: string | null
          model_description?: string | null
          monthly_total_cost?: number | null
          next_alert_km?: number | null
          next_maintenance_date?: string | null
          next_maintenance_km?: number | null
          odometer_diff_maintenance?: number | null
          ownership_type?: string | null
          pascal?: string | null
          pickup_date?: string | null
          plate_number?: string
          pollution_level?: number | null
          road_ascent_month?: number | null
          road_ascent_year?: number | null
          sale_date?: string | null
          service_interval_km?: number | null
          status?: Database["public"]["Enums"]["compliance_status"]
          tax_value_price?: number | null
          tax_year?: number | null
          test_expiry?: string
          updated_at?: string
          upgrade_addition?: number | null
          vehicle_budget?: number | null
          vehicle_type_code?: string | null
          vehicle_type_name?: string | null
          weight?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_assigned_driver_id_fkey"
            columns: ["assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_vehicle_handover: {
        Args: {
          p_assignment_mode: string
          p_created_by: string | null
          p_driver_id: string | null
          p_fuel_level: string
          p_handover_date: string
          p_handover_type: string
          p_notes: string | null
          p_odometer_reading: number
          p_org_id: string | null
          p_photo_back_url: string | null
          p_photo_front_url: string | null
          p_photo_left_url: string | null
          p_photo_right_url: string | null
          p_signature_url: string | null
          p_vehicle_id: string
        }
        Returns: Database["public"]["Tables"]["vehicle_handovers"]["Row"]
      }
      calculate_compliance_status: {
        Args: { expiry_date: string }
        Returns: Database["public"]["Enums"]["compliance_status"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_manager: { Args: { _user_id: string }; Returns: boolean }
      is_own_driver_record: {
        Args: { _driver_id: string; _user_id: string }
        Returns: boolean
      }
      sync_vehicles_from_pricing: { Args: never; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "fleet_manager" | "viewer" | "driver"
      compliance_status: "valid" | "warning" | "expired"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "fleet_manager", "viewer", "driver"],
      compliance_status: ["valid", "warning", "expired"],
    },
  },
} as const
