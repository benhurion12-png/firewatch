import type {Metadata} from 'next';
import {Provider} from '@/components/provider';
import {Shell} from '@/components/shell';
import './globals.css';
export const metadata:Metadata={title:{default:'FireWatch — мониторинг лесов',template:'%s · FireWatch'},description:'Мониторинг лесных участков, телеметрия HMP155 и FS24X, оценка пожарного риска.',icons:{icon:'/logo.svg'}};
export default function Layout({children}:{children:React.ReactNode}){
 return <html lang="ru" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:"try{document.documentElement.dataset.theme=localStorage.getItem('firewatch-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){}"}}/></head><body><Provider><Shell>{children}</Shell></Provider></body></html>;
}
