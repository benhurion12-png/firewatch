export class ApiError extends Error {constructor(message:string,public status:number){super(message);}}
export async function api<T>(path:string,init:RequestInit={}):Promise<T>{
  const response=await fetch('/api'+path,{...init,credentials:'include',headers:{'Content-Type':'application/json',...init.headers}});
  const data=await response.json().catch(()=>({message:'Сервис временно недоступен'}));
  if(!response.ok) throw new ApiError(Array.isArray(data.message)?data.message.join('. '):data.message || 'Ошибка запроса',response.status);
  return data as T;
}
export const send=<T>(path:string,body:unknown,method='POST')=>api<T>(path,{method,body:JSON.stringify(body)});
export const errorText=(e:unknown)=>e instanceof Error?e.message:'Не удалось выполнить действие';
export const formatTime=(date:string|null|undefined)=>date?new Date(date).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Нет измерений';
