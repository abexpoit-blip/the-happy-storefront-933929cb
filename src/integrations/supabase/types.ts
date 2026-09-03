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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          active: boolean
          body: string | null
          created_at: string
          id: string
          kind: string
          pinned: boolean
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          pinned?: boolean
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          pinned?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      balance_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          kind: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          user_id?: string
        }
        Relationships: []
      }
      card_checks: {
        Row: {
          bin: string | null
          created_at: string
          fee: number
          id: string
          last_digits: string | null
          order_id: string | null
          price: number
          product_id: string | null
          refunded: number
          status: string
          user_id: string
        }
        Insert: {
          bin?: string | null
          created_at?: string
          fee?: number
          id?: string
          last_digits?: string | null
          order_id?: string | null
          price?: number
          product_id?: string | null
          refunded?: number
          status: string
          user_id: string
        }
        Update: {
          bin?: string | null
          created_at?: string
          fee?: number
          id?: string
          last_digits?: string | null
          order_id?: string | null
          price?: number
          product_id?: string | null
          refunded?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_checks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_checks_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          icon: string | null
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      deposits: {
        Row: {
          admin_note: string | null
          amount: number
          charged_amount: number | null
          confirmations: number
          created_at: string
          crypto_amount: string | null
          crypto_currency: string | null
          expires_at: string | null
          fee_amount: number
          fee_percent: number
          id: string
          invoice_id: string | null
          invoice_url: string | null
          last_checked_at: string | null
          method: string
          received_amount: string | null
          reference: string | null
          status: string
          tx_url: string | null
          txid: string | null
          updated_at: string
          user_id: string
          wallet_address: string | null
        }
        Insert: {
          admin_note?: string | null
          amount: number
          charged_amount?: number | null
          confirmations?: number
          created_at?: string
          crypto_amount?: string | null
          crypto_currency?: string | null
          expires_at?: string | null
          fee_amount?: number
          fee_percent?: number
          id?: string
          invoice_id?: string | null
          invoice_url?: string | null
          last_checked_at?: string | null
          method?: string
          received_amount?: string | null
          reference?: string | null
          status?: string
          tx_url?: string | null
          txid?: string | null
          updated_at?: string
          user_id: string
          wallet_address?: string | null
        }
        Update: {
          admin_note?: string | null
          amount?: number
          charged_amount?: number | null
          confirmations?: number
          created_at?: string
          crypto_amount?: string | null
          crypto_currency?: string | null
          expires_at?: string | null
          fee_amount?: number
          fee_percent?: number
          id?: string
          invoice_id?: string | null
          invoice_url?: string | null
          last_checked_at?: string | null
          method?: string
          received_amount?: string | null
          reference?: string | null
          status?: string
          tx_url?: string | null
          txid?: string | null
          updated_at?: string
          user_id?: string
          wallet_address?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          delivered_content: string | null
          id: string
          order_id: string
          product_id: string | null
          quantity: number
          title: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          delivered_content?: string | null
          id?: string
          order_id: string
          product_id?: string | null
          quantity?: number
          title: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          delivered_content?: string | null
          id?: string
          order_id?: string
          product_id?: string | null
          quantity?: number
          title?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          id: string
          note: string | null
          order_no: string
          status: string
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          order_no?: string
          status?: string
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          order_no?: string
          status?: string
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          active: boolean
          address: string | null
          code: string
          created_at: string
          id: string
          instructions: string | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          code: string
          created_at?: string
          id?: string
          instructions?: string | null
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          code?: string
          created_at?: string
          id?: string
          instructions?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_keys: {
        Row: {
          content: string
          created_at: string
          id: string
          is_sold: boolean
          product_id: string
          sold_at: string | null
          sold_to: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_sold?: boolean
          product_id: string
          sold_at?: string | null
          sold_to?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_sold?: boolean
          product_id?: string
          sold_at?: string | null
          sold_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_keys_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          base: string | null
          bin: string | null
          brand: string | null
          category_id: string | null
          city: string | null
          compare_at_price: number | null
          country: string | null
          created_at: string
          delivery_type: string
          description: string | null
          download_url: string | null
          exp_month: string | null
          exp_year: string | null
          featured: boolean
          has_email: boolean
          has_phone: boolean
          id: string
          image_url: string | null
          instant_content: string | null
          price: number
          refundable: boolean
          short_description: string | null
          slug: string
          sold_count: number
          state: string | null
          stock: number
          title: string
          updated_at: string
          zip: string | null
        }
        Insert: {
          active?: boolean
          base?: string | null
          bin?: string | null
          brand?: string | null
          category_id?: string | null
          city?: string | null
          compare_at_price?: number | null
          country?: string | null
          created_at?: string
          delivery_type?: string
          description?: string | null
          download_url?: string | null
          exp_month?: string | null
          exp_year?: string | null
          featured?: boolean
          has_email?: boolean
          has_phone?: boolean
          id?: string
          image_url?: string | null
          instant_content?: string | null
          price?: number
          refundable?: boolean
          short_description?: string | null
          slug: string
          sold_count?: number
          state?: string | null
          stock?: number
          title: string
          updated_at?: string
          zip?: string | null
        }
        Update: {
          active?: boolean
          base?: string | null
          bin?: string | null
          brand?: string | null
          category_id?: string | null
          city?: string | null
          compare_at_price?: number | null
          country?: string | null
          created_at?: string
          delivery_type?: string
          description?: string | null
          download_url?: string | null
          exp_month?: string | null
          exp_year?: string | null
          featured?: boolean
          has_email?: boolean
          has_phone?: boolean
          id?: string
          image_url?: string | null
          instant_content?: string | null
          price?: number
          refundable?: boolean
          short_description?: string | null
          slug?: string
          sold_count?: number
          state?: string | null
          stock?: number
          title?: string
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          balance: number
          blocked: boolean
          bonus_balance: number
          created_at: string
          email: string | null
          id: string
          referral_code: string | null
          referred_by: string | null
          telegram: string | null
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          balance?: number
          blocked?: boolean
          bonus_balance?: number
          created_at?: string
          email?: string | null
          id: string
          referral_code?: string | null
          referred_by?: string | null
          telegram?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          balance?: number
          blocked?: boolean
          bonus_balance?: number
          created_at?: string
          email?: string | null
          id?: string
          referral_code?: string | null
          referred_by?: string | null
          telegram?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          bonus_amount: number
          created_at: string
          id: string
          paid_at: string
          referee_id: string
          referrer_id: string
        }
        Insert: {
          bonus_amount?: number
          created_at?: string
          id?: string
          paid_at?: string
          referee_id: string
          referrer_id: string
        }
        Update: {
          bonus_amount?: number
          created_at?: string
          id?: string
          paid_at?: string
          referee_id?: string
          referrer_id?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
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
          role: Database["public"]["Enums"]["app_role"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_adjust_balance: {
        Args: { _amount: number; _description?: string; _user_id: string }
        Returns: undefined
      }
      admin_adjust_bonus: {
        Args: { _amount: number; _description?: string; _user_id: string }
        Returns: undefined
      }
      admin_set_deposit_status: {
        Args: { _deposit_id: string; _note?: string; _status: string }
        Returns: undefined
      }
      admin_set_role: {
        Args: {
          _grant: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      award_referral_bonus: { Args: { _user_id: string }; Returns: boolean }
      expire_stale_deposits: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      purchase_product: {
        Args: { _product_id: string; _quantity?: number }
        Returns: string
      }
      settle_crypto_deposit: {
        Args: {
          _confirmations?: number
          _invoice_id: string
          _status: string
          _txid?: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "buyer" | "seller" | "admin"
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
    Enums: {
      app_role: ["buyer", "seller", "admin"],
    },
  },
} as const
