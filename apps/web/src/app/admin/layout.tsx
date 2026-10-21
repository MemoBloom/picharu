import type {Metadata} from 'next';
import {AdminConsole} from '../../components/admin-console';
export const metadata:Metadata={title:'管理员数据看板 | picmoko',robots:{index:false,follow:false}};
export default function AdminLayout({children}:{children:React.ReactNode}){return <AdminConsole>{children}</AdminConsole>;}
