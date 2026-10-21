import {notFound} from 'next/navigation';
export default async function AdminSectionPage({params}:{params:Promise<{section:string}>}){const {section}=await params;if(!['users','tools','funnel','retention','versions','finance','data-quality'].includes(section))notFound();return null;}
