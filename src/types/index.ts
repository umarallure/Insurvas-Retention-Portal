export type UserStatus = "subscribed" | "unsubscribed" | "bounced";
export type SaleStatus = "paid" | "failed" | "refunded";

export type AvatarProps = {
  src?: string;
  alt?: string;
};

export interface User {
  id: number;
  name: string;
  email: string;
  avatar?: AvatarProps;
  status: UserStatus;
  location: string;
}

export interface MondayComDeal {
  id: number
  monday_item_id: string | null
  deal_name: string | null
  tasks: string | null
  ghl_name: string | null
  ghl_stage: string | null
  policy_status: string | null
  deal_creation_date: string | null
  policy_number: string | null
  deal_value: number | null
  cc_value: number | null
  notes: string | null
  status: string | null
  last_updated: string | null
  sales_agent: string | null
  writing_no: string | null
  carrier: string | null
  commission_type: string | null
  effective_date: string | null
  call_center: string | null
  phone_number: string | null
  cc_pmt_ws: string | null
  cc_cb_ws: string | null
  carrier_status: string | null
  lead_creation_date: string | null
  policy_type: string | null
  group_title: string | null
  group_color: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Mail {
  id: number;
  unread?: boolean;
  from: User;
  subject: string;
  body: string;
  date: string;
}

export interface Member {
  name: string;
  username: string;
  role: "member" | "owner";
  avatar: AvatarProps;
}

export interface Stat {
  title: string;
  icon: string;
  value: number | string;
  variation: number;
  formatter?: (value: number) => string;
}

export interface Sale {
  id: string;
  date: string;
  status: SaleStatus;
  email: string;
  amount: number;
}

export interface Notification {
  id: number;
  unread?: boolean;
  sender: User;
  body: string;
  date: string;
}

export type Period = "daily" | "weekly" | "monthly";

export interface Range {
  start: Date;
  end: Date;
}
