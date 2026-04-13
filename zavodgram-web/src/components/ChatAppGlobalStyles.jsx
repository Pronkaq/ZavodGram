export function ChatAppGlobalStyles({ showMobileChat }) {
  return (
    <style>{`
      @keyframes slideDown{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}
      .zg-root{
        background:
          radial-gradient(1000px 550px at 15% 12%, rgba(255,255,255,.18), transparent 62%),
          radial-gradient(1200px 700px at 85% 88%, rgba(0,0,0,.45), transparent 64%),
          linear-gradient(155deg, #0f1319 0%, #151922 52%, #1d2129 100%);
      }
      .zg-root button,
      .zg-root input,
      .zg-root textarea,
      .zg-root select{
        transition: all .22s ease;
      }
      .zg-root button:hover{
        filter: brightness(1.08);
      }
      .zg-root ::-webkit-scrollbar{width:8px;height:8px}
      .zg-root ::-webkit-scrollbar-thumb{
        background: rgba(255,255,255,.22);
        border-radius: 999px;
      }
      .zg-composer:empty::before{
        content: attr(data-placeholder);
        color: rgba(199,207,219,.7);
        pointer-events: none;
      }
      .zg-rich-text a{
        color: #8db4ff;
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      @media(max-width:700px){
        .zg-chatlist{${showMobileChat ? 'display:none !important' : 'width:100% !important;max-width:100% !important'}}
        .zg-chatarea{${showMobileChat ? 'display:flex !important;width:100% !important' : 'display:none !important'}}
        .zg-back{display:flex !important}
      }
    `}</style>
  );
}
