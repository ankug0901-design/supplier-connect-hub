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
      awb: {
        Row: {
          awb_number: string
          carrier: string
          created_at: string
          id: string
          is_downloadable: boolean
          label_url: string | null
          lr_number: string | null
          po_id: string
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          awb_number: string
          carrier: string
          created_at?: string
          id?: string
          is_downloadable?: boolean
          label_url?: string | null
          lr_number?: string | null
          po_id: string
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          awb_number?: string
          carrier?: string
          created_at?: string
          id?: string
          is_downloadable?: boolean
          label_url?: string | null
          lr_number?: string | null
          po_id?: string
          status?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "awb_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awb_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      challan_items: {
        Row: {
          challan_id: string
          description: string
          id: string
          quantity: number
          unit: string
        }
        Insert: {
          challan_id: string
          description: string
          id?: string
          quantity?: number
          unit?: string
        }
        Update: {
          challan_id?: string
          description?: string
          id?: string
          quantity?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "challan_items_challan_id_fkey"
            columns: ["challan_id"]
            isOneToOne: false
            referencedRelation: "delivery_challans"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_challans: {
        Row: {
          challan_number: string
          created_at: string
          date: string
          dc_number: string | null
          delivery_address: string | null
          driver_name: string | null
          id: string
          logistics_scope: string | null
          manifest_status: string | null
          po_id: string
          supplier_id: string
          vehicle_number: string | null
        }
        Insert: {
          challan_number: string
          created_at?: string
          date?: string
          dc_number?: string | null
          delivery_address?: string | null
          driver_name?: string | null
          id?: string
          logistics_scope?: string | null
          manifest_status?: string | null
          po_id: string
          supplier_id: string
          vehicle_number?: string | null
        }
        Update: {
          challan_number?: string
          created_at?: string
          date?: string
          dc_number?: string | null
          delivery_address?: string | null
          driver_name?: string | null
          id?: string
          logistics_scope?: string | null
          manifest_status?: string | null
          po_id?: string
          supplier_id?: string
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_challans_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challans_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          attachments: string[] | null
          created_at: string
          date: string
          id: string
          invoice_number: string
          po_id: string
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          attachments?: string[] | null
          created_at?: string
          date?: string
          id?: string
          invoice_number: string
          po_id: string
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          attachments?: string[] | null
          created_at?: string
          date?: string
          id?: string
          invoice_number?: string
          po_id?: string
          status?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          date: string
          id: string
          invoice_id: string
          status: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          date?: string
          id?: string
          invoice_id: string
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          id?: string
          invoice_id?: string
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      po_items: {
        Row: {
          created_at: string
          description: string
          id: string
          po_id: string
          quantity: number
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          po_id: string
          quantity?: number
          total?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          po_id?: string
          quantity?: number
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "po_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          amount: number
          created_at: string
          date: string
          delivery_address: string | null
          expected_delivery: string | null
          id: string
          po_number: string
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          date?: string
          delivery_address?: string | null
          expected_delivery?: string | null
          id?: string
          po_number: string
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          delivery_address?: string | null
          expected_delivery?: string | null
          id?: string
          po_number?: string
          status?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_portal_requests: {
        Row: {
          artwork_drive_url: string | null
          artwork_status: string | null
          client_budget: string | null
          client_email: string | null
          client_name: string
          colours: string | null
          created_at: string
          decided_at: string | null
          dimensions: string | null
          emboss_decision: string | null
          emboss_notes: string | null
          extra_specs: string | null
          finish: string | null
          id: string
          item_specs: string | null
          lead_time_days: number | null
          material: string | null
          payment_terms: string | null
          print_process: string | null
          product_category: string | null
          product_name: string
          quantity: string | null
          quote_submitted_at: string | null
          quoted_gst_percent: number | null
          quoted_unit_price: number | null
          required_by_date: string | null
          response_deadline: string | null
          rfq_id: string
          setup_charges: number | null
          special_instructions: string | null
          status: string
          supplier_email: string
          supplier_id: string | null
          supplier_notes: string | null
          updated_at: string
          validity_days: number | null
        }
        Insert: {
          artwork_drive_url?: string | null
          artwork_status?: string | null
          client_budget?: string | null
          client_email?: string | null
          client_name: string
          colours?: string | null
          created_at?: string
          decided_at?: string | null
          dimensions?: string | null
          emboss_decision?: string | null
          emboss_notes?: string | null
          extra_specs?: string | null
          finish?: string | null
          id?: string
          item_specs?: string | null
          lead_time_days?: number | null
          material?: string | null
          payment_terms?: string | null
          print_process?: string | null
          product_category?: string | null
          product_name: string
          quantity?: string | null
          quote_submitted_at?: string | null
          quoted_gst_percent?: number | null
          quoted_unit_price?: number | null
          required_by_date?: string | null
          response_deadline?: string | null
          rfq_id: string
          setup_charges?: number | null
          special_instructions?: string | null
          status?: string
          supplier_email: string
          supplier_id?: string | null
          supplier_notes?: string | null
          updated_at?: string
          validity_days?: number | null
        }
        Update: {
          artwork_drive_url?: string | null
          artwork_status?: string | null
          client_budget?: string | null
          client_email?: string | null
          client_name?: string
          colours?: string | null
          created_at?: string
          decided_at?: string | null
          dimensions?: string | null
          emboss_decision?: string | null
          emboss_notes?: string | null
          extra_specs?: string | null
          finish?: string | null
          id?: string
          item_specs?: string | null
          lead_time_days?: number | null
          material?: string | null
          payment_terms?: string | null
          print_process?: string | null
          product_category?: string | null
          product_name?: string
          quantity?: string | null
          quote_submitted_at?: string | null
          quoted_gst_percent?: number | null
          quoted_unit_price?: number | null
          required_by_date?: string | null
          response_deadline?: string | null
          rfq_id?: string
          setup_charges?: number | null
          special_instructions?: string | null
          status?: string
          supplier_email?: string
          supplier_id?: string | null
          supplier_notes?: string | null
          updated_at?: string
          validity_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_portal_requests_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_registrations: {
        Row: {
          account_number: string | null
          account_type: string | null
          bank_name: string | null
          company: string
          created_at: string
          documents_uploaded: string[] | null
          email: string
          id: string
          ifsc_code: string | null
          msme_number: string | null
          notes: string | null
          pan_number: string | null
          status: string | null
          tan_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_number?: string | null
          account_type?: string | null
          bank_name?: string | null
          company: string
          created_at?: string
          documents_uploaded?: string[] | null
          email: string
          id?: string
          ifsc_code?: string | null
          msme_number?: string | null
          notes?: string | null
          pan_number?: string | null
          status?: string | null
          tan_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_number?: string | null
          account_type?: string | null
          bank_name?: string | null
          company?: string
          created_at?: string
          documents_uploaded?: string[] | null
          email?: string
          id?: string
          ifsc_code?: string | null
          msme_number?: string | null
          notes?: string | null
          pan_number?: string | null
          status?: string | null
          tan_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          company: string
          created_at: string
          email: string
          gst_number: string | null
          id: string
          name: string
          phone: string | null
          role: string | null
          updated_at: string
          user_id: string
          zoho_vendor_id: string | null
        }
        Insert: {
          address?: string | null
          company: string
          created_at?: string
          email: string
          gst_number?: string | null
          id?: string
          name: string
          phone?: string | null
          role?: string | null
          updated_at?: string
          user_id: string
          zoho_vendor_id?: string | null
        }
        Update: {
          address?: string | null
          company?: string
          created_at?: string
          email?: string
          gst_number?: string | null
          id?: string
          name?: string
          phone?: string | null
          role?: string | null
          updated_at?: string
          user_id?: string
          zoho_vendor_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
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
    Enums: {},
  },
} as const
