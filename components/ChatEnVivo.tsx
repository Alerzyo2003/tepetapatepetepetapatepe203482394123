'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { MessageSquareText, X, Send, Loader2, ChevronLeft, MessageSquarePlus, Paperclip, Smile, Landmark, ShieldCheck } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import EmojiPicker, { Theme, EmojiStyle } from 'emoji-picker-react'

// --- Función auxiliar para fechas amigables ---
const formatFechaAmigable = (fechaIso: string) => {
  const fecha = new Date(fechaIso);
  const horaStr = fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return horaStr; 
}

export default function ChatGlobal({ session }: { session: any }) {
  const miUsuario = session?.user
  
  const [isOpen, setIsOpen] = useState(false)
  const [view, setView] = useState<'lista' | 'chat' | 'contactos'>('lista')
  
  const [conversaciones, setConversaciones] = useState<any[]>([])
  const [contactos, setContactos] = useState<any[]>([])
  const [chatActivo, setChatActivo] = useState<any>(null)
  const [mensajes, setMensajes] = useState<any[]>([])
  
  const [usuariosConectados, setUsuariosConectados] = useState<string[]>([])
  
  const [nuevoMsg, setNuevoMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [unread, setUnread] = useState(false)
  
  const [showEmoji, setShowEmoji] = useState(false)
  const [uploadingImg, setUploadingImg] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null) // Audio para recibir
  const audioSendRef = useRef<HTMLAudioElement>(null) // Audio para enviar
  const chatActivoRef = useRef(chatActivo)
  const isOpenRef = useRef(isOpen)

  useEffect(() => { chatActivoRef.current = chatActivo }, [chatActivo])
  useEffect(() => { isOpenRef.current = isOpen }, [isOpen])

  // --- Sonidos ULTRA soft ---
  const reproducirSonidoRecibir = () => {
    if (audioRef.current) {
      audioRef.current.volume = 0.15; // Volumen sutil
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }

  const reproducirSonidoEnviar = () => {
    if (audioSendRef.current) {
      audioSendRef.current.volume = 0.1; // Aún más sutil para el envío
      audioSendRef.current.currentTime = 0;
      audioSendRef.current.play().catch(() => {});
    }
  }

  useEffect(() => {
    if (!miUsuario?.id) return;
    fetchConversaciones(miUsuario.id)
    revisarMensajesNoLeidosHistoricos(miUsuario.id)
    
    const presenceChannel = supabase.channel('online-users', {
      config: { presence: { key: miUsuario.id } },
    })

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState()
        setUsuariosConectados(Object.keys(state))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ online_at: new Date().toISOString() })
        }
      })

    const msgChannel = supabase.channel('notificaciones_globales')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, (payload) => {
        if (payload.new.emisor_id === miUsuario.id) return;
        
        const esChatActual = chatActivoRef.current?.id === payload.new.conversacion_id;
        const estaAbierto = isOpenRef.current;

        if (!estaAbierto || !esChatActual) {
          setUnread(true)
          reproducirSonidoRecibir()
        } else {
           marcarComoLeido(payload.new.conversacion_id)
        }
        fetchConversaciones(miUsuario.id)
      })
      .subscribe()
      
    return () => { 
        supabase.removeChannel(msgChannel);
        supabase.removeChannel(presenceChannel);
    }
  }, [miUsuario?.id])

  async function revisarMensajesNoLeidosHistoricos(uid: string) {
     const { data: convs } = await supabase.from('conversaciones').select('id').or(`participante1_id.eq.${uid},participante2_id.eq.${uid}`);
     if (!convs || convs.length === 0) return;
     const convIds = convs.map(c => c.id);
     const { data: sinLeer } = await supabase.from('mensajes').select('id').in('conversacion_id', convIds).neq('emisor_id', uid).eq('leido', false).limit(1);
     if (sinLeer && sinLeer.length > 0) setUnread(true);
  }

  async function marcarComoLeido(conversacionId: string) {
      if (!miUsuario?.id) return;
      await supabase.from('mensajes').update({ leido: true }).eq('conversacion_id', conversacionId).neq('emisor_id', miUsuario.id).eq('leido', false);
  }

  async function fetchConversaciones(uid: string) {
    const { data } = await supabase.from('conversaciones').select(`*, p1:participante1_id(id, nombre_completo), p2:participante2_id(id, nombre_completo)`).or(`participante1_id.eq.${uid},participante2_id.eq.${uid}`).order('updated_at', { ascending: false })
    setConversaciones(data || [])
  }

  async function fetchContactos() {
    setLoading(true)
    const { data } = await supabase.from('perfiles').select('id, nombre_completo, rol').neq('id', miUsuario.id)
    setContactos(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!chatActivo) return;
    fetchMensajes(chatActivo.id)
    marcarComoLeido(chatActivo.id)
    revisarMensajesNoLeidosHistoricos(miUsuario.id)

    const channel = supabase.channel(`mensajes_chat_${chatActivo.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes', filter: `conversacion_id=eq.${chatActivo.id}` }, 
      (payload) => {
        setMensajes(prev => {
          if (prev.find(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        })
        
        // Sonido de recibir
        if (payload.new.emisor_id !== miUsuario?.id) {
          reproducirSonidoRecibir();
        }

        setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      })
      .subscribe()
    
    return () => { supabase.removeChannel(channel) }
  }, [chatActivo?.id, miUsuario?.id])

  async function fetchMensajes(cid: string) {
    setLoading(true)
    const { data } = await supabase.from('mensajes').select('*').eq('conversacion_id', cid).order('created_at', { ascending: true })
    setMensajes(data || [])
    setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    setLoading(false)
  }

  const iniciarChatCon = async (contactoId: string) => {
    const existe = conversaciones.find(c => c.participante1_id === contactoId || c.participante2_id === contactoId)
    if (existe) {
      setChatActivo(existe); setView('chat'); return;
    }
    const { data, error } = await supabase.from('conversaciones').insert([{ participante1_id: miUsuario.id, participante2_id: contactoId }]).select(`*, p1:participante1_id(id, nombre_completo), p2:participante2_id(id, nombre_completo)`).single()
    if (error) { toast.error("Error al crear chat: " + error.message); return; }
    if (data) { setConversaciones(prev => [data, ...prev]); setChatActivo(data); setView('chat'); }
  }

  const enviar = async (e?: any) => {
    if (e) e.preventDefault()
    if (!nuevoMsg.trim() || !chatActivo) return
    
    const txt = nuevoMsg
    setNuevoMsg('')
    setShowEmoji(false) 
    
    const { data, error } = await supabase.from('mensajes').insert([{ conversacion_id: chatActivo.id, emisor_id: miUsuario.id, contenido: txt }]).select().single()

    if (error) return toast.error("No se pudo enviar el mensaje")
    if (data) {
      // Reproducir sonido de envío exitoso
      reproducirSonidoEnviar();
      setMensajes(prev => { if (prev.find(m => m.id === data.id)) return prev; return [...prev, data]; })
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
    await supabase.from('conversaciones').update({ ultimo_mensaje: txt, updated_at: new Date().toISOString() }).eq('id', chatActivo.id)
  }

  const subirImagen = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !chatActivo) return;

      setUploadingImg(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `adjuntos/${fileName}`;

      try {
          const { error: uploadError } = await supabase.storage.from('chat').upload(filePath, file);
          if (uploadError) throw uploadError;
          const { data: { publicUrl } } = supabase.storage.from('chat').getPublicUrl(filePath);

          const { data, error: dbError } = await supabase.from('mensajes').insert([{ 
            conversacion_id: chatActivo.id, 
            emisor_id: miUsuario.id, 
            contenido: '📷 Imagen adjunta',
            imagen_url: publicUrl
          }]).select().single();

          if (dbError) throw dbError;

          if (data) {
            // Reproducir sonido de envío exitoso para imagen
            reproducirSonidoEnviar();
            setMensajes(prev => { if (prev.find(m => m.id === data.id)) return prev; return [...prev, data]; })
            setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
          }
          await supabase.from('conversaciones').update({ ultimo_mensaje: '📷 Imagen enviada', updated_at: new Date().toISOString() }).eq('id', chatActivo.id);
      } catch (err: any) {
          toast.error("Error al enviar imagen");
      } finally {
          setUploadingImg(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  }

  const onEmojiClick = (emojiObject: any) => {
      setNuevoMsg(prev => prev + emojiObject.emoji)
  }

  if (!miUsuario) return null

  const otroEnChatActivoId = chatActivo?.p1?.id === miUsuario.id ? chatActivo?.p2?.id : chatActivo?.p1?.id;
  const isChatActivoOnline = usuariosConectados.includes(otroEnChatActivoId);

  return (
    <div className="fixed bottom-6 right-6 md:bottom-8 md:right-8 z-[99999] font-sans flex flex-col items-end">
      
      {/* Audios para notificaciones (Recibir y Enviar) */}
      <audio ref={audioRef} src="https://assets.mixkit.co/active_storage/sfx/2360/2360-preview.mp3" preload="auto" />
      <audio ref={audioSendRef} src="https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3" preload="auto" />
      
      <input type="file" accept="image/*" ref={fileInputRef} onChange={subirImagen} className="hidden" />

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 15, transformOrigin: 'bottom right' }} 
            animate={{ opacity: 1, scale: 1, y: 0 }} 
            exit={{ opacity: 0, scale: 0.95, y: 15, transformOrigin: 'bottom right' }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} 
            className="mb-4 w-[calc(100vw-2rem)] max-w-[360px] h-[65vh] max-h-[550px] bg-[#FDFBF7] rounded-[1.5rem] shadow-[0_25px_60px_-15px_rgba(26,36,56,0.2)] flex flex-col overflow-hidden border border-[#EADFC8]"
          >
            {/* Cabecera Estilo Roma Antigua */}
            <div className="bg-white border-b border-[#EADFC8] p-4 text-[#1A2438] flex items-center justify-between shrink-0 shadow-[0_4px_20px_-10px_rgba(193,155,94,0.1)] z-20">
              <div className="flex items-center gap-3">
                {view !== 'lista' && (
                  <button onClick={() => { setView('lista'); setChatActivo(null); revisarMensajesNoLeidosHistoricos(miUsuario.id); setShowEmoji(false); }} className="p-1 -ml-1 text-[#C19B5E] hover:bg-[#FDFBF7] rounded-lg transition-colors duration-300">
                    <ChevronLeft size={24} strokeWidth={2}/>
                  </button>
                )}
                
                <div className="w-9 h-9 rounded-full border border-[#EADFC8] bg-[#FDFBF7] flex items-center justify-center shrink-0">
                  <Landmark size={18} className="text-[#C19B5E]" strokeWidth={2} />
                </div>
                
                <div className="flex flex-col">
                  {view === 'lista' ? (
                     <>
                        <span className="text-[9px] uppercase tracking-widest text-[#C19B5E] font-bold mb-0.5">Mensajería</span>
                        <h3 className="font-serif text-[18px] leading-tight text-[#1A2438] italic">Clínica Dignidad</h3>
                     </>
                  ) : view === 'contactos' ? (
                     <>
                        <span className="text-[9px] uppercase tracking-widest text-[#C19B5E] font-bold mb-0.5">Directorio</span>
                        <h3 className="font-serif text-[18px] leading-tight text-[#1A2438] italic">Personal</h3>
                     </>
                  ) : (
                     <>
                        <h3 className="font-serif text-[17px] leading-tight text-[#1A2438]">
                           {chatActivo?.p1?.id === miUsuario.id ? chatActivo?.p2?.nombre_completo : chatActivo?.p1?.nombre_completo}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                           <div className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${isChatActivoOnline ? 'bg-[#C19B5E]' : 'bg-slate-300'}`}></div>
                           <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold transition-colors duration-500">
                              {isChatActivoOnline ? 'En línea' : 'Desconectado'}
                           </span>
                        </div>
                     </>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {view === 'lista' && (
                  <button onClick={() => { setView('contactos'); fetchContactos(); }} className="p-2 text-[#C19B5E] hover:bg-[#FDFBF7] rounded-full transition-colors duration-300" title="Nuevo chat">
                    <MessageSquarePlus size={20} strokeWidth={2}/>
                  </button>
                )}
                <button onClick={() => { setIsOpen(false); revisarMensajesNoLeidosHistoricos(miUsuario.id); setShowEmoji(false); }} className="p-2 text-slate-400 hover:text-[#1A2438] hover:bg-slate-50 rounded-full transition-colors duration-300">
                  <X size={20} strokeWidth={2.5}/>
                </button>
              </div>
            </div>

            {/* Área principal de contenido */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar relative overscroll-contain bg-[#FDFBF7]">
              
              {view === 'lista' && (
                <div className="space-y-3">
                  {conversaciones.length === 0 ? (
                    <div className="text-center mt-20 space-y-4 transition-opacity duration-500">
                      <div className="w-16 h-16 rounded-full border-2 border-[#EADFC8] mx-auto flex items-center justify-center bg-white shadow-sm">
                         <Landmark size={28} className="text-[#C19B5E]" strokeWidth={1.5} />
                      </div>
                      <p className="font-serif text-[16px] text-[#1A2438] italic">Sin mensajes recientes</p>
                      <button onClick={() => { setView('contactos'); fetchContactos(); }} className="mt-2 bg-white border border-[#EADFC8] text-[#1A2438] px-6 py-2.5 rounded-full text-[11px] uppercase tracking-widest font-bold shadow-sm hover:border-[#C19B5E] transition-all duration-300">
                        Iniciar Conversación
                      </button>
                    </div>
                  ) : (
                    conversaciones.map(c => {
                      const otro = c.participante1_id === miUsuario.id ? c.p2 : c.p1;
                      const isOnline = usuariosConectados.includes(otro?.id);

                      return (
                        <button key={c.id} onClick={() => { setChatActivo(c); setView('chat'); setUnread(false); }} className="w-full bg-white p-4 rounded-xl border border-[#EADFC8] hover:border-[#C19B5E] transition-all duration-300 flex items-center gap-4 text-left shadow-sm group">
                          <div className="w-11 h-11 bg-[#FDFBF7] border border-[#EADFC8] rounded-full flex items-center justify-center text-[#1A2438] font-serif text-lg shrink-0 relative group-hover:text-[#C19B5E] transition-colors duration-300">
                             {otro?.nombre_completo?.[0] || 'U'}
                             {isOnline && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#C19B5E] border-2 border-white rounded-full transition-all duration-500"></div>}
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <div className="flex justify-between items-center mb-1">
                               <p className="font-serif text-[15px] text-[#1A2438] truncate group-hover:text-[#C19B5E] transition-colors duration-300">{otro?.nombre_completo || 'Usuario'}</p>
                            </div>
                            <p className="text-[12px] text-slate-500 truncate font-sans">{c.ultimo_mensaje || 'Toca para conversar...'}</p>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              )}

              {view === 'contactos' && (
                <div className="space-y-3">
                  <p className="text-[9px] uppercase tracking-widest text-[#C19B5E] font-bold mb-4 ml-1">Personal Clínico</p>
                  {loading ? <Loader2 className="animate-spin mx-auto text-[#C19B5E] mt-10" /> : (
                    contactos.map(c => {
                      const isOnline = usuariosConectados.includes(c.id);
                      return (
                        <button key={c.id} onClick={() => iniciarChatCon(c.id)} className="w-full bg-white p-4 rounded-xl border border-[#EADFC8] hover:border-[#C19B5E] transition-all duration-300 flex items-center gap-4 text-left shadow-sm">
                          <div className="w-11 h-11 bg-[#FDFBF7] border border-[#EADFC8] rounded-full flex items-center justify-center text-[#1A2438] font-serif text-lg shrink-0 relative">
                             {c.nombre_completo?.[0] || 'U'}
                             {isOnline && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#C19B5E] border-2 border-white rounded-full transition-all duration-500"></div>}
                          </div>
                          <div className="flex-1">
                            <p className="font-serif text-[15px] text-[#1A2438]">{c.nombre_completo}</p>
                            <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">{c.rol}</p>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              )}

              {view === 'chat' && (
                <div className="space-y-5 pb-2 flex flex-col font-sans" onClick={() => setShowEmoji(false)}>
                  {loading ? <Loader2 className="animate-spin mx-auto mt-10 text-[#C19B5E]" /> : mensajes.map((m, i) => {
                    const isMe = m.emisor_id === miUsuario.id;
                    return (
                      <div key={m.id} className={`flex w-full gap-2 transition-all duration-300 ${isMe ? 'justify-end' : 'justify-start'}`}>
                        
                        {!isMe && (
                           <div className="w-7 h-7 rounded-full bg-white border border-[#EADFC8] flex items-center justify-center text-[#1A2438] font-serif text-[12px] shrink-0 mt-auto mb-1 shadow-sm">
                             {(chatActivo?.p1?.id === miUsuario.id ? chatActivo?.p2?.nombre_completo : chatActivo?.p1?.nombre_completo)?.[0] || 'U'}
                           </div>
                        )}

                        <div className={`max-w-[75%] px-4 py-3 text-[13.5px] shadow-sm relative flex flex-col
                            ${isMe 
                              ? 'bg-[#1A2438] text-[#FDFBF7] rounded-[1.2rem] rounded-br-sm' 
                              : 'bg-white text-[#1A2438] rounded-[1.2rem] rounded-bl-sm border border-[#EADFC8]'}`}>
                          
                          {m.imagen_url && (
                              <div className="mb-2 overflow-hidden rounded-xl bg-black/5 flex justify-center border border-white/10">
                                 <img src={m.imagen_url} alt="Adjunto" className="max-w-full h-auto object-cover cursor-pointer transition-opacity duration-300 hover:opacity-90" onClick={() => window.open(m.imagen_url, '_blank')} />
                              </div>
                          )}

                          {m.contenido !== '📷 Imagen adjunta' && (
                              <span className="leading-relaxed whitespace-pre-wrap">{m.contenido}</span>
                          )}

                          <span className={`text-[9px] self-end mt-1.5 font-semibold tracking-wider ${isMe ? 'text-[#C19B5E]' : 'text-slate-400'}`}>
                            {formatFechaAmigable(m.created_at)}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  
                  {uploadingImg && (
                      <div className="flex w-full justify-end">
                         <div className="px-4 py-3 rounded-[1.2rem] bg-white border border-[#EADFC8] rounded-br-sm flex items-center gap-2 shadow-sm">
                             <Loader2 size={14} className="animate-spin text-[#C19B5E]" />
                             <span className="text-[11px] uppercase tracking-widest text-[#1A2438] font-bold">Enviando...</span>
                         </div>
                      </div>
                  )}

                  <div ref={scrollRef} className="h-2 w-full shrink-0" />
                </div>
              )}
            </div>

            {/* Input y Footer */}
            {view === 'chat' && (
              <div className="bg-white border-t border-[#EADFC8] px-4 pb-4 pt-3 shrink-0 z-30 flex flex-col gap-3 relative">
                
                {showEmoji && (
                   <div className="absolute bottom-[100%] mb-2 left-4 right-4 z-50 shadow-lg rounded-2xl overflow-hidden border border-[#EADFC8] bg-white transition-opacity duration-300">
                      <EmojiPicker 
                         onEmojiClick={onEmojiClick} 
                         theme={Theme.LIGHT} 
                         emojiStyle={EmojiStyle.NATIVE} 
                         searchDisabled={false} 
                         skinTonesDisabled 
                         width="100%" 
                         height={300} 
                      />
                   </div>
                )}

                <form onSubmit={enviar} className="flex items-center gap-2 bg-[#FDFBF7] px-2 py-1.5 rounded-full border border-[#EADFC8] shadow-inner focus-within:border-[#C19B5E] transition-all duration-300">
                  
                  <button type="button" onClick={() => setShowEmoji(!showEmoji)} className="p-2 text-slate-400 hover:text-[#C19B5E] transition-colors duration-300 shrink-0">
                     <Smile size={20} strokeWidth={2}/>
                  </button>

                  <button type="button" onClick={() => fileInputRef.current?.click()} className="p-1 text-slate-400 hover:text-[#C19B5E] transition-colors duration-300 shrink-0">
                     <Paperclip size={18} className="rotate-45" strokeWidth={2}/>
                  </button>

                  <input autoFocus value={nuevoMsg} onChange={e => setNuevoMsg(e.target.value)} placeholder="Escribe un mensaje..." className="flex-1 bg-transparent px-2 py-2 outline-none text-[14px] text-[#1A2438] placeholder:text-slate-400 font-sans transition-colors duration-300" />
                  
                  <button type="submit" disabled={(!nuevoMsg.trim() && !uploadingImg)} className="w-10 h-10 bg-[#1A2438] text-[#C19B5E] rounded-full flex items-center justify-center hover:bg-[#253043] transition-all duration-300 disabled:opacity-50 shrink-0 shadow-sm">
                     <Send size={16} className="ml-0.5" strokeWidth={2.5} />
                  </button>
                </form>

                <div className="flex items-center justify-center gap-2 text-[9px] uppercase tracking-widest text-[#C19B5E] font-bold">
                  <ShieldCheck size={12} className="text-[#C19B5E]" />
                  <span>Comunicación Interna Segura</span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button 
        onClick={() => { 
            setIsOpen(!isOpen); 
            if (isOpen) {
               revisarMensajesNoLeidosHistoricos(miUsuario.id); 
               setShowEmoji(false);
            } else {
               setUnread(false); 
            }
        }}
        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] relative z-50 border-2 border-[#C19B5E]
          ${isOpen 
            ? 'bg-white text-[#1A2438] shadow-lg rotate-90 scale-95' 
            : 'bg-[#1A2438] text-[#C19B5E] hover:scale-105 shadow-[0_10px_25px_-5px_rgba(26,36,56,0.5)]'}
        `}
      >
        {isOpen ? <X size={26} strokeWidth={2} /> : <MessageSquareText size={26} strokeWidth={2} />}
        
        {unread && !isOpen && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C19B5E] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-[#C19B5E] border-2 border-[#1A2438]"></span>
          </span>
        )}
      </button>
    </div>
  )
}
