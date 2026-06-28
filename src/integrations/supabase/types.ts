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
      app_roles: {
        Row: {
          created_at: string
          is_system: boolean
          label: string
          role: string
        }
        Insert: {
          created_at?: string
          is_system?: boolean
          label: string
          role: string
        }
        Update: {
          created_at?: string
          is_system?: boolean
          label?: string
          role?: string
        }
        Relationships: []
      }
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
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      invoice_line_items: {
        Row: {
          actual_delivery_date: string | null
          created_at: string
          id: string
          invoice_number: string
          item_name: string
          po_number: string
          quantity: number
          rate: number
          supplier_id: string
        }
        Insert: {
          actual_delivery_date?: string | null
          created_at?: string
          id?: string
          invoice_number: string
          item_name: string
          po_number: string
          quantity?: number
          rate?: number
          supplier_id: string
        }
        Update: {
          actual_delivery_date?: string | null
          created_at?: string
          id?: string
          invoice_number?: string
          item_name?: string
          po_number?: string
          quantity?: number
          rate?: number
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_supplier_id_fkey"
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
          attachment_name: string | null
          attachments: string[] | null
          balance: number | null
          created_at: string
          date: string
          due_date: string | null
          has_attachment: boolean | null
          id: string
          invoice_number: string
          payment_date: string | null
          po_id: string
          status: string
          supplier_id: string
          updated_at: string
          zoho_id: string | null
        }
        Insert: {
          amount?: number
          attachment_name?: string | null
          attachments?: string[] | null
          balance?: number | null
          created_at?: string
          date?: string
          due_date?: string | null
          has_attachment?: boolean | null
          id?: string
          invoice_number: string
          payment_date?: string | null
          po_id: string
          status?: string
          supplier_id: string
          updated_at?: string
          zoho_id?: string | null
        }
        Update: {
          amount?: number
          attachment_name?: string | null
          attachments?: string[] | null
          balance?: number | null
          created_at?: string
          date?: string
          due_date?: string | null
          has_attachment?: boolean | null
          id?: string
          invoice_number?: string
          payment_date?: string | null
          po_id?: string
          status?: string
          supplier_id?: string
          updated_at?: string
          zoho_id?: string | null
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
          account: string | null
          amount: number
          created_at: string
          date: string
          id: string
          invoice_id: string
          payment_mode: string | null
          payment_number: string | null
          status: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          account?: string | null
          amount?: number
          created_at?: string
          date?: string
          id?: string
          invoice_id: string
          payment_mode?: string | null
          payment_number?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          account?: string | null
          amount?: number
          created_at?: string
          date?: string
          id?: string
          invoice_id?: string
          payment_mode?: string | null
          payment_number?: string | null
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
      po_exception_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          po_id: string
          reason: string
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          po_id: string
          reason: string
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          po_id?: string
          reason?: string
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "po_exception_requests_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_exception_requests_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      po_items: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_delivery_date: string | null
          created_at: string
          description: string
          hsn: string | null
          id: string
          item_name: string | null
          po_id: string
          quantity: number
          tax_name: string | null
          tax_percentage: number | null
          total: number
          unit_price: number
          zoho_line_item_id: string | null
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_delivery_date?: string | null
          created_at?: string
          description: string
          hsn?: string | null
          id?: string
          item_name?: string | null
          po_id: string
          quantity?: number
          tax_name?: string | null
          tax_percentage?: number | null
          total?: number
          unit_price?: number
          zoho_line_item_id?: string | null
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_delivery_date?: string | null
          created_at?: string
          description?: string
          hsn?: string | null
          id?: string
          item_name?: string | null
          po_id?: string
          quantity?: number
          tax_name?: string | null
          tax_percentage?: number | null
          total?: number
          unit_price?: number
          zoho_line_item_id?: string | null
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
          delivery_dates_confirmed_at: string | null
          delivery_first_notified_at: string | null
          delivery_notification_sent_at: string | null
          delivery_reminder_count: number
          exception_approved_at: string | null
          exception_rejected_at: string | null
          exception_requested_at: string | null
          expected_delivery: string | null
          id: string
          po_number: string
          status: string
          supplier_id: string
          updated_at: string
          zoho_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          date?: string
          delivery_address?: string | null
          delivery_dates_confirmed_at?: string | null
          delivery_first_notified_at?: string | null
          delivery_notification_sent_at?: string | null
          delivery_reminder_count?: number
          exception_approved_at?: string | null
          exception_rejected_at?: string | null
          exception_requested_at?: string | null
          expected_delivery?: string | null
          id?: string
          po_number: string
          status?: string
          supplier_id: string
          updated_at?: string
          zoho_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          delivery_address?: string | null
          delivery_dates_confirmed_at?: string | null
          delivery_first_notified_at?: string | null
          delivery_notification_sent_at?: string | null
          delivery_reminder_count?: number
          exception_approved_at?: string | null
          exception_rejected_at?: string | null
          exception_requested_at?: string | null
          expected_delivery?: string | null
          id?: string
          po_number?: string
          status?: string
          supplier_id?: string
          updated_at?: string
          zoho_id?: string | null
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
          closing_time: string | null
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
          last_revised_at: string | null
          lead_time_days: number | null
          material: string | null
          payment_terms: string | null
          price_rank: number | null
          print_process: string | null
          product_category: string | null
          product_name: string
          quantity: string | null
          quote_submitted_at: string | null
          quoted_gst_percent: number | null
          quoted_unit_price: number | null
          required_by_date: string | null
          response_deadline: string | null
          revision_count: number | null
          rfq_closed_at: string | null
          rfq_id: string
          setup_charges: number | null
          special_instructions: string | null
          status: string
          submitted_by_email: string | null
          submitted_by_name: string | null
          supplier_company: string | null
          supplier_email: string
          supplier_id: string | null
          supplier_notes: string | null
          total_price: number | null
          updated_at: string
          validity_days: number | null
        }
        Insert: {
          artwork_drive_url?: string | null
          artwork_status?: string | null
          client_budget?: string | null
          client_email?: string | null
          client_name: string
          closing_time?: string | null
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
          last_revised_at?: string | null
          lead_time_days?: number | null
          material?: string | null
          payment_terms?: string | null
          price_rank?: number | null
          print_process?: string | null
          product_category?: string | null
          product_name: string
          quantity?: string | null
          quote_submitted_at?: string | null
          quoted_gst_percent?: number | null
          quoted_unit_price?: number | null
          required_by_date?: string | null
          response_deadline?: string | null
          revision_count?: number | null
          rfq_closed_at?: string | null
          rfq_id: string
          setup_charges?: number | null
          special_instructions?: string | null
          status?: string
          submitted_by_email?: string | null
          submitted_by_name?: string | null
          supplier_company?: string | null
          supplier_email: string
          supplier_id?: string | null
          supplier_notes?: string | null
          total_price?: number | null
          updated_at?: string
          validity_days?: number | null
        }
        Update: {
          artwork_drive_url?: string | null
          artwork_status?: string | null
          client_budget?: string | null
          client_email?: string | null
          client_name?: string
          closing_time?: string | null
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
          last_revised_at?: string | null
          lead_time_days?: number | null
          material?: string | null
          payment_terms?: string | null
          price_rank?: number | null
          print_process?: string | null
          product_category?: string | null
          product_name?: string
          quantity?: string | null
          quote_submitted_at?: string | null
          quoted_gst_percent?: number | null
          quoted_unit_price?: number | null
          required_by_date?: string | null
          response_deadline?: string | null
          revision_count?: number | null
          rfq_closed_at?: string | null
          rfq_id?: string
          setup_charges?: number | null
          special_instructions?: string | null
          status?: string
          submitted_by_email?: string | null
          submitted_by_name?: string | null
          supplier_company?: string | null
          supplier_email?: string
          supplier_id?: string | null
          supplier_notes?: string | null
          total_price?: number | null
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
      role_section_access: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          role: string
          section_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          role: string
          section_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          role?: string
          section_key?: string
          updated_at?: string
        }
        Relationships: []
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
      supplier_section_access: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          section_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          section_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          section_key?: string
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      three_way_matches: {
        Row: {
          amount_match: boolean | null
          client_invoice_amount: number | null
          client_invoice_date: string | null
          client_invoice_number: string | null
          client_invoice_status: string | null
          client_invoices: Json
          client_name: string | null
          client_payment_amount: number | null
          client_payment_date: string | null
          client_payment_received: boolean | null
          client_payment_reference: string | null
          client_quantity: number | null
          created_at: string
          id: string
          match_status: string | null
          matched_at: string | null
          n8n_status: string | null
          notes: string | null
          overdue: boolean | null
          po_number: string | null
          po_numbers: string[]
          quantity_match: boolean | null
          raw_payload: Json | null
          so_number: string
          supplier_company: string | null
          supplier_id: string | null
          supplier_invoice_amount: number | null
          supplier_invoice_date: string | null
          supplier_invoice_number: string | null
          supplier_invoices: Json
          supplier_name: string | null
          supplier_payment_eligible: boolean | null
          supplier_payment_status: string | null
          supplier_quantity: number | null
          total_balance_due: number | null
          total_invoice_amount: number | null
          total_margin: number | null
          total_supplier_amount: number | null
          updated_at: string
        }
        Insert: {
          amount_match?: boolean | null
          client_invoice_amount?: number | null
          client_invoice_date?: string | null
          client_invoice_number?: string | null
          client_invoice_status?: string | null
          client_invoices?: Json
          client_name?: string | null
          client_payment_amount?: number | null
          client_payment_date?: string | null
          client_payment_received?: boolean | null
          client_payment_reference?: string | null
          client_quantity?: number | null
          created_at?: string
          id?: string
          match_status?: string | null
          matched_at?: string | null
          n8n_status?: string | null
          notes?: string | null
          overdue?: boolean | null
          po_number?: string | null
          po_numbers?: string[]
          quantity_match?: boolean | null
          raw_payload?: Json | null
          so_number: string
          supplier_company?: string | null
          supplier_id?: string | null
          supplier_invoice_amount?: number | null
          supplier_invoice_date?: string | null
          supplier_invoice_number?: string | null
          supplier_invoices?: Json
          supplier_name?: string | null
          supplier_payment_eligible?: boolean | null
          supplier_payment_status?: string | null
          supplier_quantity?: number | null
          total_balance_due?: number | null
          total_invoice_amount?: number | null
          total_margin?: number | null
          total_supplier_amount?: number | null
          updated_at?: string
        }
        Update: {
          amount_match?: boolean | null
          client_invoice_amount?: number | null
          client_invoice_date?: string | null
          client_invoice_number?: string | null
          client_invoice_status?: string | null
          client_invoices?: Json
          client_name?: string | null
          client_payment_amount?: number | null
          client_payment_date?: string | null
          client_payment_received?: boolean | null
          client_payment_reference?: string | null
          client_quantity?: number | null
          created_at?: string
          id?: string
          match_status?: string | null
          matched_at?: string | null
          n8n_status?: string | null
          notes?: string | null
          overdue?: boolean | null
          po_number?: string | null
          po_numbers?: string[]
          quantity_match?: boolean | null
          raw_payload?: Json | null
          so_number?: string
          supplier_company?: string | null
          supplier_id?: string | null
          supplier_invoice_amount?: number | null
          supplier_invoice_date?: string | null
          supplier_invoice_number?: string | null
          supplier_invoices?: Json
          supplier_name?: string | null
          supplier_payment_eligible?: boolean | null
          supplier_payment_status?: string | null
          supplier_quantity?: number | null
          total_balance_due?: number | null
          total_invoice_amount?: number | null
          total_margin?: number | null
          total_supplier_amount?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      vendor_scores: {
        Row: {
          company: string
          created_at: string
          grade: string
          id: string
          metrics: Json
          recommendation: string | null
          score: number
          scored_at: string
          strengths: Json
          supplier_id: string
          weaknesses: Json
        }
        Insert: {
          company: string
          created_at?: string
          grade: string
          id?: string
          metrics?: Json
          recommendation?: string | null
          score: number
          scored_at?: string
          strengths?: Json
          supplier_id: string
          weaknesses?: Json
        }
        Update: {
          company?: string
          created_at?: string
          grade?: string
          id?: string
          metrics?: Json
          recommendation?: string | null
          score?: number
          scored_at?: string
          strengths?: Json
          supplier_id?: string
          weaknesses?: Json
        }
        Relationships: []
      }
    }
    Views: {
      supplier_delivery_performance: {
        Row: {
          actual_delivery_date: string | null
          days_variance: number | null
          expected_delivery: string | null
          invoice_number: string | null
          item_name: string | null
          on_time: boolean | null
          po_number: string | null
          quantity: number | null
          supplier_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _supplier_dash_auth: { Args: { _supplier_id: string }; Returns: boolean }
      confirm_po_delivery_dates: {
        Args: { _items: Json; _po_id: string }
        Returns: Json
      }
      dashboard_activity_feed: { Args: { p_limit?: number }; Returns: Json }
      dashboard_ai_insights: { Args: { p_limit?: number }; Returns: Json }
      dashboard_ap_aging: { Args: never; Returns: Json }
      dashboard_attention_counts: { Args: never; Returns: Json }
      dashboard_category_mix: { Args: never; Returns: Json }
      dashboard_kpis: { Args: never; Returns: Json }
      dashboard_match_status: { Args: never; Returns: Json }
      dashboard_spend_trend: { Args: { months?: number }; Returns: Json }
      dashboard_this_week: { Args: never; Returns: Json }
      dashboard_top_items: { Args: { p_limit?: number }; Returns: Json }
      dashboard_top_suppliers: { Args: { p_limit?: number }; Returns: Json }
      dashboard_velocity: { Args: never; Returns: Json }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_invoiced_quantities_for_po: {
        Args: { _po_number: string; _supplier_id: string }
        Returns: {
          item_name: string
          total_quantity: number
        }[]
      }
      has_section_access: { Args: { _section_key: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      pct_change: { Args: { curr: number; prev: number }; Returns: number }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_invoice_line_items: {
        Args: {
          _invoice_number: string
          _items: Json
          _po_number: string
          _supplier_id: string
        }
        Returns: number
      }
      request_po_exception: {
        Args: { _po_id: string; _reason: string }
        Returns: string
      }
      review_po_exception: {
        Args: { _admin_notes: string; _decision: string; _request_id: string }
        Returns: Json
      }
      supplier_active_rfqs: {
        Args: { p_limit?: number; p_supplier_id: string }
        Returns: Json
      }
      supplier_activity_feed: {
        Args: { p_limit?: number; p_supplier_id: string }
        Returns: Json
      }
      supplier_attention_counts: {
        Args: { p_supplier_id: string }
        Returns: Json
      }
      supplier_kpis: { Args: { p_supplier_id: string }; Returns: Json }
      supplier_receivables_aging: {
        Args: { p_supplier_id: string }
        Returns: Json
      }
      supplier_velocity: { Args: { p_supplier_id: string }; Returns: Json }
      to_lakhs: { Args: { amount: number }; Returns: number }
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
