# Documentación de Arquitectura y Modelo C4 - SGIP

**Materia:** Diseño y Arquitectura de Software (ISWZ2202)  
**Proyecto:** Sistema de Gestión Integrada de Pacientes (SGIP)  
**Entregable:** Documentación Técnica de Arquitectura (C4, Infraestructura y Despliegue)  

---

## 1. Modelo C4 - Diagramas de Arquitectura

El Modelo C4 divide la arquitectura del software en diferentes niveles de abstracción (Contexto, Contenedores, Componentes y Código). A continuación se presentan los tres primeros niveles detallados en sintaxis **Mermaid.js**.

### 1.1. Nivel 1: Diagrama de Contexto del Sistema
Muestra cómo el sistema **SGIP** se sitúa dentro de la organización, interactuando con los usuarios y los sistemas externos.

```mermaid
graph TB
    subgraph Users ["Usuarios del Sistema"]
        Médico["Médico / Personal de Salud"]
        Admin["Personal de Administración / Call Center"]
    end

    subgraph CoreSystem ["Frontera del Ecosistema"]
        SGIP["SGIP<br>(Sistema de Gestión Integrada de Pacientes)"]
    end

    subgraph ExternalSystems ["Sistemas Externos de SGIP"]
        Sistema de Laboratorio["Sistema de Laboratorio Clínico<br>(Laboratorio Externo)"]
        MailServer["Servidor de Correo SMTP<br>(Redis Server)"]
    end

    Médico -->|Registra pacientes y visita proyectos| SGIP
    Admin -->|Califica pacientes y supervisa ofertas| SGIP
    SGIP -->|Sincroniza cotizaciones aprobadas| Sistema de Laboratorio
    SGIP -->|Envía correos con PDFs a clientes| MailServer
```

---

### 1.2. Nivel 2: Diagrama de Contenedores (Arquitectura Física)
Muestra los contenedores en ejecución (servicios API, frontend, bases de datos y colas de mensajería) desplegados mediante Docker Compose.

```mermaid
graph TD
    User([Médico / Administrador]) -->|Peticiones HTTP/REST| Gateway["API Gateway<br>(Nginx Container)"]
    
    subgraph "Docker Compose Ecosystem"
        Gateway -->|Enruta '/'| FE["App 1: Portal Web (Frontend)<br>(HTML5 / JS / CSS en Nginx)"]
        Gateway -->|Enruta '/api/v1/patients'| BE["App 2: Patients Service (Backend API)<br>(FastAPI / Python)"]
        
        BE -->|Persiste pacientes| DB[("Capa de Datos: MySQL DB<br>(Docker Volume)")]
        BE -->|Publica eventos de pacientes| Queue["Queue Manager: RabbitMQ Broker<br>(Docker Container)"]
        
        Queue -->|Event Trigger| Lambda["App 3: Notification Lambda<br>(Python Listener Container)"]
        
        Lambda -->|Caché de alertas y sesiones| Cache[("Capa de Datos: Redis Cache<br>(Docker Volume)")]
        
        BE -->|Consulta alertas| Cache
    end

    classDef app fill:#2563eb,stroke:#1d4ed8,color:#fff;
    classDef db fill:#059669,stroke:#047857,color:#fff;
    classDef broker fill:#d97706,stroke:#b45309,color:#fff;
    
    class FE,BE,Lambda app;
    class DB,Cache db;
    class Queue broker;
```

---

### 1.3. Nivel 3: Diagrama de Componentes
Detalle de la arquitectura interna de los microservicios **Patients Service** y **Notification Lambda**.

```mermaid
graph TB
    subgraph "Patients Service Components"
        API["FastAPI Controller<br>(main.py)"]
        Config["Config Settings<br>(config.py)"]
        DBConn["Database Session<br>(database.py)"]
        ORM["SQLAlchemy Models<br>(models.py)"]
        Publisher["Queue Publisher<br>(queue_manager.py)"]
        
        API --> Config
        API --> DBConn
        DBConn --> ORM
        API --> Publisher
    end
    
    subgraph "Notification Lambda Components"
        Runner["RabbitMQ Event Listener<br>(lambda_runner.py)"]
        Handler["Azure Function Handler<br>(function_app.py)"]
        RedisClient["Redis Connector"]
        
        Runner --> Handler
        Handler --> RedisClient
    end
    
    Publisher -->|Envía JSON| Runner
    RedisClient -->|Guarda lista JSON| Cache[(Redis Cache)]
    ORM -->|Guarda registro| DB[(MySQL DB)]
```

---

## 2. Diagrama de Despliegue en la Nube (Azure Production)

Este diagrama representa la topología de red física y lógica en la nube de **Microsoft Azure**, utilizando el crédito estudiantil y aprovechando servicios completamente administrados de bajo consumo.

```mermaid
graph TD
    subgraph AzureSub ["Suscripción de Azure (Azure for Students)"]
        subgraph RG ["Grupo de Recursos: RG-SGIP-SGIP"]
            
            Static["Azure Static Web Apps<br>(Frontend Estático)"]
            
            APIM["Azure API Management (APIM)<br>(API Gateway y Políticas CORS)"]
            
            ACA["Azure Container Apps<br>(Patients Service Docker Container)"]
            
            MySQL["Azure Database for MySQL<br>(Capa Flexible - Burstable B1ms)"]
            
            ASB["Azure Service Bus Namespace<br>(Cola: pacientes-queue - Basic Tier)"]
            
            Func["Azure Functions (Serverless)<br>(Plan de Consumo / Pago por uso)"]
            
            Redis["Azure Cache for Redis<br>(Capa Básica C0)"]
            
            AppInsights["Application Insights<br>(Logs & Monitoreo)"]
            
        end
    end

    Client([Dispositivo Cliente]) -->|HTTPS| Static
    Client -->|HTTPS API Requests| APIM
    APIM -->|Reverse Proxy| ACA
    ACA -->|Lectura/Escritura| MySQL
    ACA -->|Publica Paciente Creado| ASB
    ASB -->|Trigger de Cola| Func
    Func -->|Escribe Alerta| Redis
    ACA -->|Lee Alertas| Redis
    Func -->|Telemetría| AppInsights
    ACA -->|Telemetría| AppInsights
```

### Protocolos de Comunicación Utilizados
1. **Cliente ➔ Frontend**: HTTPS (Puerto 443).
2. **Cliente ➔ API Gateway (APIM)**: HTTPS REST (Puerto 443).
3. **API Gateway ➔ Patients Service**: HTTP REST interno.
4. **Patients Service ➔ MySQL**: Protocolo nativo de MySQL sobre TCP/IP (Puerto 3306).
5. **Patients Service ➔ Service Bus**: AMQP sobre WebSockets (Puerto 5671/443).
6. **Service Bus ➔ Azure Function**: Disparador por polling interno (AMQP).
7. **Azure Function ➔ Redis**: Protocolo RESP de Redis seguro (TLS Puerto 6380).
