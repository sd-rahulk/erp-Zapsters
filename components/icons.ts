import { Activity, Bell, Boxes, CalendarDays, ChartNoAxesColumnIncreasing, ClipboardList, FileText, History,
  LayoutDashboard, PackageCheck, Settings2, ShieldCheck, ShoppingCart, Store, UsersRound, WalletCards, Warehouse, TriangleAlert } from "lucide-react";
import type { Module } from "@/lib/types";
export const moduleIcons: Record<Module,typeof Activity> = {
  dashboard:LayoutDashboard,employees:UsersRound,leave:CalendarDays,inventory:Boxes,movements:History,suppliers:Store,
  purchasing:ClipboardList,orders:ShoppingCart,sales:PackageCheck,invoices:FileText,reports:ChartNoAxesColumnIncreasing,
  users:ShieldCheck,audit:History,settings:Settings2,notifications:Bell,
};
export const metricIcons = {users:UsersRound,shield:ShieldCheck,activity:Activity,boxes:Boxes,alert:TriangleAlert,cart:ShoppingCart,
  clipboard:ClipboardList,wallet:WalletCards,calendar:CalendarDays,warehouse:Warehouse};

