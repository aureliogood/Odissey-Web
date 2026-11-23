# =============================================================
#  WAF (firewall de aplicacion web) para Odissey
# -------------------------------------------------------------
#  Que es: una capa que filtra el trafico ANTES de que llegue a tu
#  codigo. Bloquea bots, escaneres, inyeccion SQL, XSS y fuerza
#  bruta, y mitiga DDoS.
#
#  Por que las tres opciones de abajo y no una sola: cada una
#  cubre un tipo de ataque distinto.
#
#    1. Cloudflare (gratis)   -> lo mejor para DDoS y rate limiting.
#                                 Ademas oculta la IP del origen.
#    2. ModSecurity / LiteSpeed -> reglas detailed en el servidor.
#                                 Para inyeccion SQL y XSS.
#    3. Wordfence / Sucuri     -> solo si la web fuera WordPress.
#                                 Odissey NO es WordPress: esto no aplica.
# =============================================================

> El bot ya no forma parte del despliegue; estas notas se conservan solo como referencia histórica. Las cabeceras CSP reales están en .htaccess y odissey-security-headers.conf.

# -------------------------------------------------------------
# 1. CLOUDFLARE (gratis) - LO MAS RECOMENDADO
# -------------------------------------------------------------
#  Pasos, en este orden:
#
#  1) Crear cuenta en cloudflare.com y anadir odisseymc.site.
#     En el DNS, pon los registros con el icono de nube naranja
#     (proxy activada). NO uses el plug-in de WordPress, no hace
#     falta: esto es una web estatica en GitHub Pages + Supabase.
#
#  2) SSL/TLS > Overview:
#        Full (strict)  <- obligatorio. Con "Flexible" el trafico
#        entre Cloudflare y tu servidor viaja en claro y ademas
#        Cloudflare avisa al visitante con un aviso rojo.
#     En la pagina 2 del asistente marca "Always Use HTTPS".
#
#  3) SSL/TLS > Edge Certificates > Always Use HTTPS: ON.
#     SSL/TLS > Edge Certificates > Minimum TLS Version: TLS 1.2.
#     SSL/TLS > Edge Certificates > Automatic HTTPS Rewrites: ON.
#
#  4) Ocultar la IP real (lo importante de verdad):
#     SSL/TLS > Origin Server > Orange Cloud -> rayo gris (DNS only)
#        -> Create Certificate
#     Con eso Cloudflare te da un certificado que cubre
#     odisseymc.site, www.odisseymc.site y *.
#     Luego, en el firewall del servidor, SOLO se acepta trafico de
#     los rangos de Cloudflare (los tienes en
#     https://www.cloudflare.com/ips-v4). Con eso, la IP del
#     servidor deja de ser util para nadie.
#
#  5) DNS > Records: estos son los registros que Create Certificate
#     necesita apuntar al servidor:
#        A     odisseymc.site        <IP_DEL_SERVIDOR>  Proxied
#        CNAME www                   odisseymc.site      Proxied
#
#  6) Reglas del WAF (todas gratis, todas en Security > WAF >
#     Custom Rules). Copia estas de una en una:
#
#  --- REGLA 1: Bloquear escaneres automaticos -------------------
#  Name:  Bloquear escaneres
#  Expression:
#     (http.request.uri.path matches "(?i)\\.(env|git|sql|bak|old|"
#     "log|zip|tar|gz|7z|rar|ps1|bat|sh|py|rb|ini|yml|cfg)$")
#     or (http.request.uri.path contains "/.git")
#     or (http.request.uri.path contains "/.env")
#     or (http.request.uri.path contains "/wp-admin")
#     or (http.request.uri.path contains "/wp-login")
#     or (http.request.uri.path contains "/vendor/phpunit")
#     or (http.request.uri.path contains "/cgi-bin")
#     or (http.request.uri.path contains "/phpmyadmin")
#  Action: Block
#
#  --- REGLA 2: Bloquear inyeccion SQL --------------------------------
#  Name:  Inyeccion SQL
#  Expression:
#     http.request.uri.query matches "(?i)(union[ +%]select|"
#     "information_schema|concat\\(|benchmark\\(|sleep\\(|"
#     "load_file|outfile|drop[ +%]table|insert[ +%]into|"
#     "or[ +%]1[ +%]=[ +%]1|')"
#  Action: Block
#
#  --- REGLA 3: Bloquear XSS clasico -------------------------------
#  Name:  XSS
#  Expression:
#     http.request.uri.query matches "(?i)(<script|</script|"
#     "onerror[ +%]*=|onload[ +%]*=|javascript:|"
#     "<iframe|document\\.cookie|eval%28)"
#  Action: Block
#
#  --- REGLA 4: Path traversal -------------------------------------
#  Name:  Path traversal
#  Expression:
#     http.request.uri.path contains "../"
#     or (http.request.uri.path contains "%2e%2e")
#     or (http.request.uri.path contains "..%2f")
#  Action: Block
#
#  --- HISTORICO: las reglas 5, 6 y 9 apuntaban a /bot/api/* --------
#  El bot ya no forma parte del despliegue; Supabase Auth gestiona login
#  y registro con sus propios limites. Estas tres reglas NO aplican hoy:
#  se conservan como referencia por si hiciera falta limitar otro endpoint.
#
#  --- REGLA 5 (historica): Limitar la API (fuerza bruta) ----------
#  Name:  Limitar intentos de login
#  Expression:    starts_with(http.request.uri.path, "/bot/api/auth/login")
#  Rate limiting: 5 requests / 1 minute, por IP
#  Action: Block
#  NOTA: Cloudflare NO limita por IP si la regla no lleva "per IP".
#  En el editor de reglas, en "Configure rate limiting", pon
#  "Counting characteristics > IP Address".
#
#  --- REGLA 6 (historica): Limitar el registro --------------------
#  Name:  Limitar cuentas nuevas
#  Expression:    starts_with(http.request.uri.path, "/bot/api/auth/register")
#  Rate limiting: 3 requests / 10 minutes, por IP
#  Action: Block
#
#  --- REGLA 7: Bloquear METHOD allowed ----------------------------
#  Name:  Solo GET, POST, HEAD y OPTIONS
#  Expression:
#     not (http.request.method in {"GET" "POST" "HEAD" "OPTIONS"})
#  Action: Block
#
#  --- REGLA 8: No permitir bots Aggressivos -----------------------
#  Security > Bots > Bot Fight Mode: ON (gratis)
#  Si algun dia hay presupuesto, Super Bot Fight Mode + las
#  reglas de Allow/Block por user agent.
#
#  --- REGLA 9 (historica): Rate limit de la API ------------------
#  Name:  Limitar la API en general
#  Expression:    starts_with(http.request.uri.path, "/bot/api/")
#  Rate limiting: 120 requests / 1 minute, por IP
#  Action: Block
#
#  7) Seguridad extra que si es gratis:
#     - Security > Settings > "Minimum TLS Version": TLS 1.2
#     - Security > Settings > "Browser Integrity Check": ON
#     - Security > Settings > "Security Level": Medium
#     - Security > WAF > Managed Rules: activate las 4 gratuitas
#       (Coraza JavaScript, Cloudflare Managed, Free Managed,
#       OWASP Core) si tu cuenta las incluye.
#     - Speed > Optimization > "Rocket Loader": NO, rompe el JS del
#       sitio (los scripts se cargan en otro momento y rompen el
#       orden de arranque).
#
#  8) HISTORICO: lo que Cloudflare no podia hacer y se hacia en el bot:
#     Ya no hay bot: contrastalo con Supabase Auth / RLS antes de aplicar
#     nada de esta lista.
#     - El rate limiting por CUENTA (no por IP) cuando alguien entra
#       desde la IP de una oficina o una escuela.
#     - El bloqueo temporal a los 5 intentos fallidos.
#     - El 2FA de los administradores.
#     - El hash de contrasenas.
#     Ver SEGURIDAD.md.


# -------------------------------------------------------------
# 2. MODSECURITY / LITESPEED WAF (en el servidor)
# -------------------------------------------------------------
#  ModSecurity es un modulo de Apache/LiteSpeed que aplica reglas
#  sobre CADA peticion antes de que llegue al PHP o al antiguo bot. Es la
#  capa que vive en el servidor y que sigue funcionando aunque
#  Cloudflare este caido.
#
#  En un hosting cPanelLiteSpeed (lo habitual para Odissey):
#    Panel cPanel > Seguridad > ModSecurity
#    Activalo en modo "Bloqueo" (Block, no Detection Only).
#    LiteSpeed ya trae las reglas OWASP CRS preinstaladas.
#
#  Con Apache puro (VPS):
#    sudo apt install libapache2-mod-security2
#    sudo a2enmod security2
#    sudo cp /etc/modsecurity/owasp-crs/*.conf /etc/modsecurity/
#    # y en el VirtualHost:
#    <IfModule mod_security2.c>
#      SecRuleEngine On
#      SecRequestBodyAccess On
#      SecResponseBodyAccess Off
#      SecAuditEngine RelevantOnly
#    </IfModule>
#
#  Reglas extra para Odissey (archivomodsecurity/odissey-rules.conf):
#
#  -------------------------------------------------------------
#  # Limitar el cuerpo de la peticion: la web/Supabase no necesitan
#  # cuerpos grandes.
#  SecRuleRequestBodyLimit 262144 "id:1001,\
#    phase:1,deny,status:413,log,\
#    msg:'Cuerpo de peticion demasiado grande'"
#
#  # Prohibir metodos raros. TRACE ya se bloquea en el .htaccess;
#  # aqui se cierran los demas.
#  SecRule REQUEST_METHOD "!@within GET POST HEAD OPTIONS" \
#    "id:1002,phase:1,deny,status:405,log,\
#    msg:'Metodo HTTP no permitido'"
#
#  # Nada de PHP en un sitio que no es PHP.
#  SecRule REQUEST_FILENAME "@endsWith .php" \
#    "id:1003,phase:1,deny,status:404,log,\
#    msg:'Intento de ejecutar PHP en un sitio estatico'"
#
#  # Ficheros de configuracion y credenciales.
#  SecRule REQUEST_URI "@pm .ht|.env|.git|.ssh|wp-config|"
#    ".htpasswd|id_rsa" \
#    "id:1004,phase:1,deny,status:404,log,\
#    msg:'Intento de leer un fichero de configuracion'"
#
#  # HISTORICO: fuerza bruta contra el login del bot (ruta /bot/api/...).
#  # Mas de 20 intentos por minuto desde la misma IP. El bot ya no existe:
#  # la ruta no esta desplegada; la referencia se conserva solo como ejemplo.
#  SecRule REQUEST_URI "@streq /bot/api/auth/login" \
#    "id:1005,phase:1,chain,log,deny,status:429"
#    SecRule IP:REQUEST_COUNT "@gt 20" "t:none"
#
#  # User agents de escaneres conocidos.
#  SecRule REQUEST_HEADERS:User-Agent "@pm sqlmap nikto dirbuster "
#    "wpscanacunetix nmap masscan zgrab nuclei" \
#    "id:1006,phase:1,deny,status:403,log,\
#    msg:'User agent de escaner bloqueado'"
#  -------------------------------------------------------------
#
#  NOTA IMPORTANTE sobre ModSecurity y este proyecto:
#  El sitio usa mucho JavaScript con plantilla en linea (y antes el bot
#  recibia JSON). Si al activar ModSecurity alguna cosa rompe, mira
#  /var/log/modsec_audit.log para ver que regla salta y ajustala con
#  SecRuleRemoveById. No desactives ModSecurity entero para que una
#  pagina cargue: eso seria volver a estar desprotegido.


# -------------------------------------------------------------
# 3. LO QUE NO APLICA A ODISSEY
# -------------------------------------------------------------
#  La lista de la que salen las capturas de redes sociales habla de
#  WordPress: "WordPress, plugins y tema al dia", "ningun plugin
#  pirata", "acceso distinto a wp-admin".
#
#  Odissey NO es WordPress. No hay panel de WordPress, ni plugins,
#  ni tema, ni wp-admin. Todo eso son problemas de otra plataforma.
#
#  Equivalente real (HISTORICO: describia el despliegue con bot):
#
#  - "Plugins y tema al dia" -> antes, las dependencias del bot:
#      cd /ruta/del/bot && npm audit --audit-level=high
#      El bot ya no se despliega. Hoy hay que revisar las librerias
#      que cargan los HTML desde CDN y la configuracion de Supabase.
#  - "Acceso distinto a wp-admin" -> /admin sigue protegido, pero ya no
#      hay un /api/admin/check en el bot: el rol admin lo comprueba RLS
#      en Supabase (ver supabase/02-politicas.sql). La Basic Auth de Nginx
#      descrita en nginx.conf.example era del despliegue anterior.
#  - "Escaner de virus diario" -> ver SEGURIDAD.md, seccion
#      "Escaneo de malware".