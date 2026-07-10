# SGIP — Sistema de Gestión Integrada de Pacientes y Telemedicina

Este repositorio contiene la entrega final del **Proyecto Integrador** para la materia de **Diseño y Arquitectura de Software (ISWZ2202)** de la **Universidad de las Américas (UDLA)**.

---

## 👥 Integrantes (FICA - Ingeniería de Software)
*   **Jean Carlos Gómez Mafla**
*   **Adrian Morales Quilumba**
*   **Nicolas Puco**

**Docente:** Mónica Fernanda Sanchez Rosero  
**Fecha:** Julio de 2026  

---

## ⚠️ Declaración de Reutilización y Evolución de Código (Legacy)

Este proyecto representa la evolución y refactorización de un sistema anterior de automatización comercial e industrial denominado **INSECOM CRM**. 

Para cumplir rigurosamente con los lineamientos, rúbricas y el nuevo dominio de aplicación (salud y telemedicina) exigidos por la docente **Mónica Sanchez**, se realizaron las siguientes modificaciones estructurales:
*   **Reestructuración del Dominio:** Se transformó el flujo de captura de prospectos (leads) y ventas en un **portal clínico integral** enfocado en historiales médicos, diagnósticos y gestión de citas.
*   **Motor de Reglas Clínicas (CDSS):** Se implementó un validador en tiempo real en la función serverless (Lambda Worker) para analizar constantes vitales clínicas (Temperatura, Frecuencia Cardíaca, Saturación de Oxígeno SpO2, Presión Arterial) y alertar estados críticos de salud.
*   **Seguridad y Roles:** Se rediseñó el control de accesos basado en roles (RBAC) para el personal médico (roles de *Administrador* con privilegios de escritura y *Doctor* en modo lectura).
*   **Alineación de la Documentación:** Toda la documentación técnica (Diagramas C4, Análisis de los 9 Atributos de Calidad, Monitoreo y Pipelines de CI/CD) fue rescrita desde cero para el ámbito hospitalario.

La base de código original de INSECOM se encuentra conservada intacta en la carpeta `/legacy` como testimonio de la evolución histórica del software. El sistema clínico de producción activo reside en la carpeta `/medical`.

---

## 📁 Estructura del Repositorio

El proyecto está organizado en las siguientes carpetas lógicas:

```
├── medical/                   # Ecosistema activo del Sistema Clínico (SGIP)
│   ├── services/              # Microservicios del Backend
│   │   ├── patients-api/      # API Rest transaccional (FastAPI + MySQL)
│   │   └── notification-worker/# Lambda Serverless (Azure Function Simulator + Redis)
│   ├── gateway/               # API Gateway centralizado (Nginx Reverse Proxy)
│   ├── frontend/              # Portal Médico SPA (HTML5, Vanilla JS, Chart.js)
│   ├── infra/                 # Plantillas de Infraestructura Cloud (Azure ARM Templates)
│   └── docs/                  # Entregables técnicos y Presentación Interactiva
│
└── legacy/                    # Base de código previa (INSECOM CRM) utilizada para la refactorización
```

---

## 🚀 Instrucciones de Ejecución Local (medical/)

Para levantar el ecosistema de 7 contenedores Docker en tu entorno local:

1.  Asegúrate de tener **Docker Desktop** iniciado en tu sistema operativo.
2.  Ingresa a la carpeta del proyecto clínico:
    ```bash
    cd medical
    ```
3.  Ejecuta el script de inicio avanzado (autodetecta puertos libres de forma dinámica en Windows para evitar colisiones con bases de datos locales):
    ```powershell
    .\iniciar_proyecto.bat
    ```
4.  O levanta los servicios directamente con Docker Compose:
    ```bash
    docker-compose up -d --build
    ```

### 🔗 Direcciones de los Servicios Locales:
*   **Portal Clínico Web:** [http://localhost:80](http://localhost:80) (API Gateway)
*   **FastAPI Swagger Docs:** [http://localhost:80/api/v1/docs](http://localhost:80/api/v1/docs)
*   **Credenciales de Prueba:**
    *   **Administrador:** Usuario: `admin` | Contraseña: `admin123` *(Privilegios totales)*
    *   **Médico:** Usuario: `doctor` | Contraseña: `doctor123` *(Modo Lectura)*
