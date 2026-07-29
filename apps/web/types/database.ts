export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          category: string
          description: string | null
          key: string
          label: string
          max_value: number | null
          min_value: number | null
          options: Json | null
          updated_at: string
          updated_by: string | null
          value: Json
          value_type: string
        }
        Insert: {
          category: string
          description?: string | null
          key: string
          label: string
          max_value?: number | null
          min_value?: number | null
          options?: Json | null
          updated_at?: string
          updated_by?: string | null
          value: Json
          value_type: string
        }
        Update: {
          category?: string
          description?: string | null
          key?: string
          label?: string
          max_value?: number | null
          min_value?: number | null
          options?: Json | null
          updated_at?: string
          updated_by?: string | null
          value?: Json
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: number
          payload: Json | null
          target: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: number
          payload?: Json | null
          target?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: number
          payload?: Json | null
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cells: {
        Row: {
          alt_m: number | null
          centroid: unknown
          curvature: number | null
          dept: string
          dist_edge_m: number | null
          dist_path_m: number | null
          dist_stream_m: number | null
          eastness: number | null
          essence: string | null
          forest_code: string | null
          forest_share: number | null
          h3_index: string
          h3_r7: string | null
          hosts: string[]
          northness: number | null
          restricted: boolean
          restriction: string | null
          slope_pct: number | null
          soil_clay_pct: number | null
          soil_ph: number | null
          soil_soc: number | null
          solar_index: number | null
          tpi: number | null
          twi: number | null
          updated_at: string
        }
        Insert: {
          alt_m?: number | null
          centroid: unknown
          curvature?: number | null
          dept: string
          dist_edge_m?: number | null
          dist_path_m?: number | null
          dist_stream_m?: number | null
          eastness?: number | null
          essence?: string | null
          forest_code?: string | null
          forest_share?: number | null
          h3_index: string
          h3_r7?: string | null
          hosts?: string[]
          northness?: number | null
          restricted?: boolean
          restriction?: string | null
          slope_pct?: number | null
          soil_clay_pct?: number | null
          soil_ph?: number | null
          soil_soc?: number | null
          solar_index?: number | null
          tpi?: number | null
          twi?: number | null
          updated_at?: string
        }
        Update: {
          alt_m?: number | null
          centroid?: unknown
          curvature?: number | null
          dept?: string
          dist_edge_m?: number | null
          dist_path_m?: number | null
          dist_stream_m?: number | null
          eastness?: number | null
          essence?: string | null
          forest_code?: string | null
          forest_share?: number | null
          h3_index?: string
          h3_r7?: string | null
          hosts?: string[]
          northness?: number | null
          restricted?: boolean
          restriction?: string | null
          slope_pct?: number | null
          soil_clay_pct?: number | null
          soil_ph?: number | null
          soil_soc?: number | null
          solar_index?: number | null
          tpi?: number | null
          twi?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      finds: {
        Row: {
          created_at: string
          id: string
          location: unknown
          maturity: string | null
          outing_id: string
          photo_path: string | null
          quantity_g: number | null
          species_id: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          location?: unknown
          maturity?: string | null
          outing_id: string
          photo_path?: string | null
          quantity_g?: number | null
          species_id?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          location?: unknown
          maturity?: string | null
          outing_id?: string
          photo_path?: string | null
          quantity_g?: number | null
          species_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "finds_outing_id_fkey"
            columns: ["outing_id"]
            isOneToOne: false
            referencedRelation: "outings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finds_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast: {
        Row: {
          confidence: number
          h3_index: string
          run_id: string
          scores: number[]
          species_id: number
        }
        Insert: {
          confidence: number
          h3_index: string
          run_id: string
          scores: number[]
          species_id: number
        }
        Update: {
          confidence?: number
          h3_index?: string
          run_id?: string
          scores?: number[]
          species_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "forecast_h3_index_fkey"
            columns: ["h3_index"]
            isOneToOne: false
            referencedRelation: "cells"
            referencedColumns: ["h3_index"]
          },
          {
            foreignKeyName: "forecast_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_runs: {
        Row: {
          cells_count: number | null
          error: string | null
          finished_at: string | null
          id: string
          started_at: string
          status: string
        }
        Insert: {
          cells_count?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status: string
        }
        Update: {
          cells_count?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      outings: {
        Row: {
          created_at: string
          duration_min: number | null
          found_nothing: boolean
          h3_index: string | null
          id: string
          location: unknown
          notes: string | null
          occurred_on: string
          user_id: string
          visibility: string
          weather_snapshot: Json | null
        }
        Insert: {
          created_at?: string
          duration_min?: number | null
          found_nothing?: boolean
          h3_index?: string | null
          id?: string
          location?: unknown
          notes?: string | null
          occurred_on?: string
          user_id: string
          visibility?: string
          weather_snapshot?: Json | null
        }
        Update: {
          created_at?: string
          duration_min?: number | null
          found_nothing?: boolean
          h3_index?: string | null
          id?: string
          location?: unknown
          notes?: string | null
          occurred_on?: string
          user_id?: string
          visibility?: string
          weather_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "outings_h3_index_fkey"
            columns: ["h3_index"]
            isOneToOne: false
            referencedRelation: "cells"
            referencedColumns: ["h3_index"]
          },
          {
            foreignKeyName: "outings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          category: string
          key: string
          label: string
        }
        Insert: {
          category: string
          key: string
          label: string
        }
        Update: {
          category?: string
          key?: string
          label?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          home_lat: number | null
          home_lng: number | null
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          display_name: string
          home_lat?: number | null
          home_lng?: number | null
          id: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          display_name?: string
          home_lat?: number | null
          home_lng?: number | null
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          permission?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_fkey"
            columns: ["permission"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      species: {
        Row: {
          alt_max_m: number | null
          alt_min_m: number | null
          common_name_fr: string
          dangerous_confusions: string | null
          gbif_taxon_key: number | null
          host_codes: string[]
          id: number
          is_enabled: boolean
          notes_terrain: string | null
          ph_max: number | null
          ph_min: number | null
          prefers_calcareous: boolean
          rain_lag_days: number | null
          rain_optimum_mm: number | null
          scientific_name: string
          season_end_doy: number | null
          season_start_doy: number | null
          slug: string
          soil_temp_opt_c: number | null
          soil_temp_tol_c: number | null
          sort_order: number
          thermophilic: boolean
        }
        Insert: {
          alt_max_m?: number | null
          alt_min_m?: number | null
          common_name_fr: string
          dangerous_confusions?: string | null
          gbif_taxon_key?: number | null
          host_codes?: string[]
          id?: number
          is_enabled?: boolean
          notes_terrain?: string | null
          ph_max?: number | null
          ph_min?: number | null
          prefers_calcareous?: boolean
          rain_lag_days?: number | null
          rain_optimum_mm?: number | null
          scientific_name: string
          season_end_doy?: number | null
          season_start_doy?: number | null
          slug: string
          soil_temp_opt_c?: number | null
          soil_temp_tol_c?: number | null
          sort_order?: number
          thermophilic?: boolean
        }
        Update: {
          alt_max_m?: number | null
          alt_min_m?: number | null
          common_name_fr?: string
          dangerous_confusions?: string | null
          gbif_taxon_key?: number | null
          host_codes?: string[]
          id?: number
          is_enabled?: boolean
          notes_terrain?: string | null
          ph_max?: number | null
          ph_min?: number | null
          prefers_calcareous?: boolean
          rain_lag_days?: number | null
          rain_optimum_mm?: number | null
          scientific_name?: string
          season_end_doy?: number | null
          season_start_doy?: number | null
          slug?: string
          soil_temp_opt_c?: number | null
          soil_temp_tol_c?: number | null
          sort_order?: number
          thermophilic?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can: { Args: { perm: string }; Returns: boolean }
      cells_in_view: {
        Args: {
          detailed?: boolean
          east: number
          north: number
          south: number
          west: number
        }
        Returns: {
          a: number
          e: string
          f: number
          h: string
          n: number
        }[]
      }
      forecast_in_view: {
        Args: {
          detailed?: boolean
          east: number
          north: number
          south: number
          species_slug: string
          west: number
        }
        Returns: {
          c: number
          h: string
          s: number[]
        }[]
      }
      is_active_user: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "member" | "viewer"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["super_admin", "admin", "member", "viewer"],
    },
  },
} as const

