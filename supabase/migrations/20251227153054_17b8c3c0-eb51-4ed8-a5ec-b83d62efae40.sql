-- Create suppliers table
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT NOT NULL,
  gst_number TEXT,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Create purchase_orders table
CREATE TABLE public.purchase_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE NOT NULL,
  po_number TEXT NOT NULL UNIQUE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'invoiced', 'partial', 'completed')),
  delivery_address TEXT,
  expected_delivery DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create po_items table
CREATE TABLE public.po_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  po_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create invoices table
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE NOT NULL,
  po_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE NOT NULL,
  invoice_number TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  attachments TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create payments table
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed')),
  transaction_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create delivery_challans table
CREATE TABLE public.delivery_challans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE NOT NULL,
  po_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE NOT NULL,
  challan_number TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  vehicle_number TEXT,
  driver_name TEXT,
  delivery_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create challan_items table
CREATE TABLE public.challan_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challan_id UUID REFERENCES public.delivery_challans(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'pcs'
);

-- Create awb table
CREATE TABLE public.awb (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE NOT NULL,
  po_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE NOT NULL,
  awb_number TEXT NOT NULL,
  carrier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'dispatched', 'in-transit', 'delivered')),
  is_downloadable BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_challans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.awb ENABLE ROW LEVEL SECURITY;

-- RLS Policies for suppliers
CREATE POLICY "Suppliers can view own profile" ON public.suppliers
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Suppliers can update own profile" ON public.suppliers
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Suppliers can insert own profile" ON public.suppliers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for purchase_orders
CREATE POLICY "Suppliers can view own POs" ON public.purchase_orders
  FOR SELECT USING (
    supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid())
  );

-- RLS Policies for po_items
CREATE POLICY "Suppliers can view own PO items" ON public.po_items
  FOR SELECT USING (
    po_id IN (
      SELECT po.id FROM public.purchase_orders po 
      JOIN public.suppliers s ON po.supplier_id = s.id 
      WHERE s.user_id = auth.uid()
    )
  );

-- RLS Policies for invoices
CREATE POLICY "Suppliers can view own invoices" ON public.invoices
  FOR SELECT USING (
    supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid())
  );

CREATE POLICY "Suppliers can insert own invoices" ON public.invoices
  FOR INSERT WITH CHECK (
    supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid())
  );

CREATE POLICY "Suppliers can update own invoices" ON public.invoices
  FOR UPDATE USING (
    supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid())
  );

-- RLS Policies for payments
CREATE POLICY "Suppliers can view own payments" ON public.payments
  FOR SELECT USING (
    invoice_id IN (
      SELECT i.id FROM public.invoices i 
      JOIN public.suppliers s ON i.supplier_id = s.id 
      WHERE s.user_id = auth.uid()
    )
  );

-- RLS Policies for delivery_challans
CREATE POLICY "Suppliers can view own challans" ON public.delivery_challans
  FOR SELECT USING (
    supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid())
  );

CREATE POLICY "Suppliers can insert own challans" ON public.delivery_challans
  FOR INSERT WITH CHECK (
    supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid())
  );

-- RLS Policies for challan_items
CREATE POLICY "Suppliers can view own challan items" ON public.challan_items
  FOR SELECT USING (
    challan_id IN (
      SELECT dc.id FROM public.delivery_challans dc 
      JOIN public.suppliers s ON dc.supplier_id = s.id 
      WHERE s.user_id = auth.uid()
    )
  );

CREATE POLICY "Suppliers can insert own challan items" ON public.challan_items
  FOR INSERT WITH CHECK (
    challan_id IN (
      SELECT dc.id FROM public.delivery_challans dc 
      JOIN public.suppliers s ON dc.supplier_id = s.id 
      WHERE s.user_id = auth.uid()
    )
  );

-- RLS Policies for awb
CREATE POLICY "Suppliers can view own AWBs" ON public.awb
  FOR SELECT USING (
    supplier_id IN (SELECT id FROM public.suppliers WHERE user_id = auth.uid())
  );

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_awb_updated_at
  BEFORE UPDATE ON public.awb
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;