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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      api_account_keys: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          token_hash: string
          token_hint: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          token_hash: string
          token_hint: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          token_hash?: string
          token_hint?: string
          user_id?: string
        }
        Relationships: []
      }
      api_account_payments: {
        Row: {
          amount_atomic: number
          chain: string
          created_at: string
          id: string
          paid_at: string
          payer: string
          plan_id: string
          quote_id: string | null
          tx: string
          user_id: string
        }
        Insert: {
          amount_atomic: number
          chain: string
          created_at?: string
          id?: string
          paid_at: string
          payer: string
          plan_id: string
          quote_id?: string | null
          tx: string
          user_id: string
        }
        Update: {
          amount_atomic?: number
          chain?: string
          created_at?: string
          id?: string
          paid_at?: string
          payer?: string
          plan_id?: string
          quote_id?: string | null
          tx?: string
          user_id?: string
        }
        Relationships: []
      }
      api_accounts: {
        Row: {
          created_at: string
          expires_at: string | null
          plan_id: string | null
          quota: number
          updated_at: string
          used: number
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          plan_id?: string | null
          quota?: number
          updated_at?: string
          used?: number
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          plan_id?: string | null
          quota?: number
          updated_at?: string
          used?: number
          user_id?: string
        }
        Relationships: []
      }
      api_checkout_quotes: {
        Row: {
          chain: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          payer: string
          plan_id: string
          user_id: string
        }
        Insert: {
          chain: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          payer: string
          plan_id: string
          user_id: string
        }
        Update: {
          chain?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          payer?: string
          plan_id?: string
          user_id?: string
        }
        Relationships: []
      }
      api_rate_limits: {
        Row: {
          bucket: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket: string
          hits?: number
          window_start?: string
        }
        Update: {
          bucket?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      api_usage_events: {
        Row: {
          allowed: boolean
          chain: string | null
          created_at: string
          endpoint: string
          id: number
          key_id: string | null
          units: number
          user_id: string
        }
        Insert: {
          allowed?: boolean
          chain?: string | null
          created_at?: string
          endpoint: string
          id?: never
          key_id?: string | null
          units: number
          user_id: string
        }
        Update: {
          allowed?: boolean
          chain?: string | null
          created_at?: string
          endpoint?: string
          id?: never
          key_id?: string | null
          units?: number
          user_id?: string
        }
        Relationships: []
      }
      human_ai_conversations: {
        Row: {
          created_at: string
          messages: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          messages?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          messages?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      machine_api_keys: {
        Row: {
          chain: string
          created_at: string
          token_hash: string
          wallet: string
        }
        Insert: {
          chain: string
          created_at?: string
          token_hash: string
          wallet: string
        }
        Update: {
          chain?: string
          created_at?: string
          token_hash?: string
          wallet?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_api_keys_chain_wallet_fkey"
            columns: ["chain", "wallet"]
            isOneToOne: true
            referencedRelation: "machine_entitlements"
            referencedColumns: ["chain", "wallet"]
          },
        ]
      }
      machine_api_usage: {
        Row: {
          chain: string
          period_start: string
          used: number
          wallet: string
        }
        Insert: {
          chain: string
          period_start?: string
          used?: number
          wallet: string
        }
        Update: {
          chain?: string
          period_start?: string
          used?: number
          wallet?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_api_usage_chain_wallet_fkey"
            columns: ["chain", "wallet"]
            isOneToOne: true
            referencedRelation: "machine_entitlements"
            referencedColumns: ["chain", "wallet"]
          },
        ]
      }
      machine_challenges: {
        Row: {
          chain: string
          consumed_at: string | null
          expires_at: string
          issued_at: string
          nonce: string
          wallet: string
        }
        Insert: {
          chain: string
          consumed_at?: string | null
          expires_at: string
          issued_at?: string
          nonce: string
          wallet: string
        }
        Update: {
          chain?: string
          consumed_at?: string | null
          expires_at?: string
          issued_at?: string
          nonce?: string
          wallet?: string
        }
        Relationships: []
      }
      machine_entitlements: {
        Row: {
          chain: string
          expires_at: string
          plan_id: string
          wallet: string
        }
        Insert: {
          chain: string
          expires_at: string
          plan_id: string
          wallet: string
        }
        Update: {
          chain?: string
          expires_at?: string
          plan_id?: string
          wallet?: string
        }
        Relationships: []
      }
      machine_payments: {
        Row: {
          amount_atomic: number
          chain: string
          created_at: string
          id: string
          paid_at: string
          plan_id: string
          tx: string
          wallet: string
        }
        Insert: {
          amount_atomic: number
          chain: string
          created_at?: string
          id?: string
          paid_at: string
          plan_id: string
          tx: string
          wallet: string
        }
        Update: {
          amount_atomic?: number
          chain?: string
          created_at?: string
          id?: string
          paid_at?: string
          plan_id?: string
          tx?: string
          wallet?: string
        }
        Relationships: []
      }
      machine_sessions: {
        Row: {
          chain: string
          expires_at: string
          issued_at: string
          token_hash: string
          wallet: string
        }
        Insert: {
          chain: string
          expires_at: string
          issued_at?: string
          token_hash: string
          wallet: string
        }
        Update: {
          chain?: string
          expires_at?: string
          issued_at?: string
          token_hash?: string
          wallet?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_api_checkout: {
        Args: { p_user_id: string; p_quote_id: string; p_tx: string; p_paid_at: string }
        Returns: Json
      }
      activate_machine_payment: {
        Args: { p_chain: string; p_wallet: string; p_plan: string; p_tx: string; p_paid_at: string; p_amount: number }
        Returns: Json
      }
      consume_account_api_units: {
        Args: {
          p_chain: string
          p_cost: number
          p_endpoint: string
          p_token_hash: string
        }
        Returns: {
          allowed: boolean
          batch_limit: number
          expires_at: string
          plan_id: string
          quota: number
          remaining: number
          used: number
        }[]
      }
      consume_machine_api_units: {
        Args: { p_cost: number; p_token_hash: string }
        Returns: {
          batch_limit: number
          expires_at: string
          plan_id: string
          quota: number
          remaining: number
          used: number
        }[]
      }
      consume_machine_api_units_v2: {
        Args: { p_cost: number; p_token_hash: string }
        Returns: {
          allowed: boolean
          batch_limit: number
          expires_at: string
          plan_id: string
          quota: number
          remaining: number
          used: number
        }[]
      }
      hit_api_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
