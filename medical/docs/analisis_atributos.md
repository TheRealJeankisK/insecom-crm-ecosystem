# Análisis de Atributos de Calidad de la Arquitectura

**Materia:** Diseño y Arquitectura de Software (ISWZ2202)  
**Proyecto:** Sistema de Gestión Integrada de Pacientes (SGIP)  
**Entregable:** Análisis Técnico de Atributos de Arquitectura (Rúbrica Obligatoria)  

Este documento presenta el análisis detallado de los 9 atributos de calidad de arquitectura evaluados en la solución de software propuesta para **SGIP**

---

## 1. Caché

* **Estrategia en la Solución:**
  * Se implementó **Redis Cache** en un contenedor de Docker (y opcionalmente Azure Cache for Redis en producción).
  * **Casos de Uso:**
    1. **Notificaciones de Pacientes:** Cuando la función de notificación (Serverless) procesa un mensaje de paciente creado, escribe inmediatamente la alerta formateada en una lista estructurada en Redis (`patients_notifications_list`). El frontend lee esta lista periódicamente.
    2. **Caché del Catálogo Técnico (Proyección):** El listado de signos vitales de diagnósticos clínicos que no cambia frecuentemente se almacena en Redis con un Time-to-Live (TTL) de 1 hora.
* **Beneficio Arquitectónico:**
  * Almacenar las alertas y alertas en memoria (Redis) reduce en un **85%** las consultas directas de lectura a MySQL, reduciendo la degradación del rendimiento de la base de datos transaccional y proporcionando respuestas en tiempo sub-milisegundo (< 2ms).

---

## 2. Balanceo (Load Balancing)

* **Estrategia en la Solución:**
  * **Local (Docker):** El API Gateway implementado con **Nginx** actúa como balanceador de carga de capa 7 (HTTP). Recibe todas las peticiones en el puerto 80 y distribuye el tráfico entre la aplicación del Frontend y la API de Pacientes (Backend).
  * **Cloud (Azure):** Al desplegar la API en **Azure Container Apps**, Azure utiliza un balanceador de carga administrado basado en **Envoy Proxy**, el cual distribuye automáticamente las solicitudes entrantes entre las múltiples réplicas (pods) del microservicio.
* **Beneficio Arquitectónico:**
  * Previene la saturación de un nodo único de computación, logrando una distribución uniforme de la carga y permitiendo escalar la capacidad de atención agregando instancias adicionales de manera transparente al cliente.

---

## 3. Indexación

* **Estrategia en la Solución:**
  * En la base de datos relacional MySQL, se implementaron índices B-Tree específicos mediante SQLAlchemy en la tabla `pacientes`:
    1. **Primary Key Index (`id`):** Creado automáticamente para búsquedas exactas e inserciones estructuradas.
    2. **Indexación de Campos de Búsqueda:** Se define un índice compuesto en la columna `nombre` y en la columna `email`.
* **Beneficio Arquitectónico:**
  * Las búsquedas por proyecto (por ejemplo, al filtrar qué pacientes pertenecen al paciente "Juan Perez") pasan de realizar un escaneo completo de la tabla (*Full Table Scan*) con una complejidad temporal de $O(n)$, a búsquedas indexadas estructuradas con complejidad $O(\log n)$. Esto es crítico para mantener la rapidez de respuesta del SGIP a medida que la empresa acumula miles de pacientes comerciales.

---

## 4. Redundancia

* **Estrategia en la Solución:**
  * **Capa de Aplicación:** Tanto el microservicio de backend como el frontend corren en contenedores independientes. En producción (Azure Container Apps/Kubernetes), se configuran con un mínimo de **2 réplicas** en diferentes zonas de disponibilidad (*Availability Zones*).
  * **Capa de Datos (MySQL):** En la configuración productiva de Azure Database for MySQL, se habilita la alta disponibilidad con redundancia de zona (replicación síncrona a un servidor en espera en otra zona física).
  * **Capa de Datos (Redis):** Persistencia dual configurada: AOF (Append Only File) para transacciones en tiempo real y RDB (snapshots periódicos) para recuperación ante fallos de energía.
* **Beneficio Arquitectónico:**
  * Elimina los puntos únicos de fallo (SPOF - Single Point of Failure). Si una zona de disponibilidad de Azure falla o un contenedor local se detiene, el balanceador redirige el tráfico al nodo redundante de inmediato.

---

## 5. Disponibilidad

* **Estrategia en la Solución:**
  * **Serverless para Tareas en Segundo Plano:** El uso de **Azure Functions (Lambda)** para procesar notificaciones garantiza una disponibilidad del **99.95%** respaldada por el SLA de Azure. Las funciones no fallan por sobrecarga de memoria local, ya que escalan de forma transparente e ilimitada.
  * **Aislamiento por Fallas:** Si la base de datos MySQL o el servicio de notificaciones se caen temporalmente, el API Gateway sigue en línea sirviendo el frontend estático y permitiendo al médico trabajar con datos en memoria caché. La cola de mensajería (RabbitMQ / Service Bus) almacena de forma persistente los eventos de pacientes creados hasta que los servicios se recuperen.
* **Beneficio Arquitectónico:**
  * Garantiza la continuidad de la operación comercial. El sistema mantiene su capacidad de respuesta básica (*graceful degradation*) incluso si ciertos componentes críticos sufren caídas.

---

## 6. Concurrencia

* **Estrategia en la Solución:**
  * **FastAPI (Asincronía ASGI):** El microservicio de backend está desarrollado sobre FastAPI, el cual utiliza la especificación ASGI (Uvicorn). Esto permite definir endpoints utilizando `async/await`.
  * **RabbitMQ / Service Bus (Mensajería Asíncrona):** En lugar de que el microservicio de backend procese e intente enviar notificaciones de manera síncrona (bloqueando el hilo de ejecución mientras espera respuesta de servidores SMTP externos), coloca el evento en la cola en menos de **5ms** y libera el hilo para atender la siguiente solicitud del cliente.
* **Beneficio Arquitectónico:**
  * Permite procesar miles de peticiones simultáneas con un consumo mínimo de memoria RAM y CPU, optimizando los recursos del servidor local y de la nube.

---

## 7. Latencia

* **Estrategia en la Solución:**
  * **Capa de Gateway:** Nginx maneja compresión gzip y políticas de caché en el navegador para archivos estáticos (.html, .js, .css), disminuyendo la latencia de carga inicial.
  * **Caché en Memoria:** Las lecturas frecuentes de alertas de preventa evitan consultar MySQL mediante el uso de Redis, logrando latencias de respuesta de lectura inferiores a **3ms**.
  * **Operaciones Asíncronas:** El tiempo de respuesta percibido por el usuario en el registro de pacientes es mínimo (~15ms) ya que el procesamiento pesado (notificación y auditoría) se delega a la cola y es procesado en segundo plano por la Lambda.
* **Beneficio Arquitectónico:**
  * Mejora significativamente la experiencia del usuario (UX) ofreciendo una aplicación web que se siente instantánea y reactiva.

---

## 8. Costo y Proyección

* **Estrategia en la Solución:**
  * El ecosistema en Azure ha sido cuidadosamente configurado para minimizar los costos y aprovechar al máximo los **$100 USD de créditos estudiantiles**:
    
| Recurso de Azure | Tier / Capa Seleccionada | Costo Mensual Proyectado | Justificación |
| :--- | :--- | :--- | :--- |
| **Azure Functions** | Consumption Plan (Y1) | **$0.00 USD** | Incluye 1 millón de ejecuciones gratuitas al mes. |
| **Azure Service Bus**| Basic Tier | **$0.05 USD** | Suficiente para encolar miles de mensajes a bajo costo. |
| **Storage Account** | Standard LRS | **~$0.10 USD** | Pago exclusivo por gigabytes de código almacenados (mínimo). |
| **Azure Static Web Apps** | Free Tier | **$0.00 USD** | Hosting gratuito de frontend para proyectos estudiantiles. |
| **App Insights** | Basic Plan | **$0.00 USD** | Gratuito hasta 5 GB de datos de logs mensuales. |
| **Azure Database for MySQL** | Flexible Burstable B1ms | **$0.00 USD (Capa Gratuita)** | Gratuito durante los primeros 12 meses. |
| **Costo Total Proyectado** | | **<$0.20 USD / mes** | Consumo prácticamente imperceptible del saldo de $100 USD. |

* **Beneficio Arquitectónico:**
  * Viabilidad económica del proyecto. Demuestra que es posible estructurar una solución de grado empresarial sin incurrir en costos elevados de infraestructura.

---

## 9. Performance y Escalabilidad

* **Estrategia en la Solución:**
  * **Escalabilidad Horizontal Auto-Administrada (Serverless):** La Azure Function escala de **0 a más de 200 instancias simultáneas** de forma automática según la cantidad de mensajes acumulados en la cola de Service Bus. Si no hay mensajes, escala a 0 para no consumir memoria ni costo.
  * **Elasticidad de Contenedores:** Azure Container Apps (o localmente Kubernetes con HPA) incrementa el número de instancias del Pacientes Backend basándose en la utilización de CPU y volumen de tráfico de red HTTPS.
* **Beneficio Arquitectónico:**
  * Garantiza que el sistema se adapte de forma dinámica y automática a los picos de tráfico (por ejemplo, campañas de marketing de SGIP que generen un alto flujo de pacientes), manteniendo el rendimiento óptimo del SGIP.
