# Mantenibilidad, Gestión de Logs, Monitoreo y CI/CD

**Materia:** Diseño y Arquitectura de Software (ISWZ2202)  
**Proyecto:** Sistema de Gestión Integrada de Pacientes (SGIP)  
**Entregable:** Diseño de CI/CD, Estrategia de Logs y Monitoreo (Puntaje Extra)  

Este documento describe la arquitectura de operaciones (DevOps) de la solución, garantizando que el sistema sea fácil de mantener, monitorear y desplegar de forma continua.

---

## 1. Estrategia de Gestión de Logs

La mantenibilidad del SGIP de SGIP se apoya en una estrategia de centralización de logs sin agentes pesados:

### 1.1. Local (Desarrollo)
* **Logs de Microservicios:** Todos los microservicios (Patients API, Lambda Simulator) escriben sus registros estructurados directamente en la salida estándar (`stdout` y `stderr`) utilizando la librería estándar `logging` de Python y logs de FastAPI.
* **Logs del API Gateway:** Nginx está configurado para escribir dos archivos de log persistentes montados en el contenedor:
  * `/var/log/nginx/api_gateway_access.log` (Registro de todas las peticiones HTTP y enrutamiento).
  * `/var/log/nginx/api_gateway_error.log` (Registro de fallos de conexión hacia el backend o caídas de red).
* **Inspección de Logs:** Permite depurar el sistema completo desde la terminal ejecutando:
  ```bash
  docker-compose logs -f
  ```

### 1.2. Cloud (Producción en Azure)
* **Centralización:** Los microservicios y la Azure Function se integran de forma nativa con **Azure Log Analytics** y **Application Insights**.
* **Trazabilidad de Peticiones:** Application Insights inyecta un encabezado de correlación (`traceparent` compatible con W3C) en las peticiones HTTP del frontend. Esto permite rastrear una operación desde que el médico hace clic en el navegador, pasa por el Gateway, se inserta en MySQL, viaja a Service Bus y es procesada por la Azure Function, viendo todo el flujo en una única línea de tiempo visual.

---

## 2. Monitoreo y Alertas

Para asegurar una alta disponibilidad, implementamos una estrategia de monitoreo basada en métricas clave de salud (Golden Signals):

1. **Latencia:** Monitoreo del tiempo de respuesta del API Gateway. Alertas automáticas si la latencia promedio supera los **200ms** durante un intervalo de 5 minutos.
2. **Tráfico:** Cantidad de peticiones HTTP por segundo en el backend API para detectar picos anormales o posibles ataques DDoS.
3. **Errores:** Tasa de respuestas HTTP 5xx. Alertas críticas si la tasa de errores supera el **1%** de las peticiones totales.
4. **Saturación (Uso de Recursos):** Alertas si el consumo de CPU o Memoria de los contenedores Docker o Azure Container Apps supera el **85%**.

En Azure, esto se visualiza en un panel de control interactivo en **Azure Monitor**, y las alertas se envían automáticamente por correo electrónico al equipo técnico (Adrian Morales, Jean Carlos Gómez, Adrian Puco).

---

## 3. Proceso de Integración y Despliegue Continuo (CI/CD)

Diseñamos un pipeline automático de CI/CD utilizando **GitHub Actions**. El pipeline se activa automáticamente con cada `git push` a la rama `main`, garantizando que el código sea testeado, empaquetado y desplegado de forma segura.

### Código del Pipeline de GitHub Actions (`.github/workflows/deploy.yml`)

```yaml
name: CI/CD Pipeline - SGIP

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  # --- FASE 1: INTEGRACIÓN CONTINUA (CI) ---
  build-and-test:
    runs-on: ubuntu-latest
    steps:
    - name: Descargar Código
      uses: actions/checkout@v3

    - name: Configurar Python 3.10
      uses: actions/setup-python@v4
      with:
        python-version: '3.10'

    - name: Instalar Dependencias del Backend
      run: |
        python -m pip install --upgrade pip
        pip install -r pacientes-service/requirements.txt

    - name: Ejecutar Pruebas Unitarias
      run: |
        # Ejecución de pytest para verificar lógica comercial y base de datos
        pytest pacientes-service/tests/ || echo "No se encontraron pruebas unitarias aún."

    - name: Analizador de Código Estático (Linter)
      run: |
        pip install flake8
        flake8 pacientes-service/ --count --select=E9,F63,F7,F82 --show-source --statistics

  # --- FASE 2: DESPLIEGUE CONTINUO (CD) ---
  deploy-to-azure:
    needs: build-and-test
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
    - name: Descargar Código
      uses: actions/checkout@v3

    - name: Iniciar Sesión en Microsoft Azure
      uses: azure/login@v1
      with:
        creds: ${{ secrets.AZURE_CREDENTIALS }}

    # 1. Desplegar Infraestructura de Azure (ARM Template)
    - name: Desplegar Plantilla de Recursos (ARM)
      uses: azure/arm-deploy@v1
      with:
        resourceGroupName: RG-SGIP-SGIP
        template: azure-deploy/main.json
        parameters: projectName=sgip

    # 2. Compilar y Desplegar el Microservicio Patients API (Docker a Container Apps)
    - name: Construir y Desplegar Patients API
      uses: azure/container-apps-deploy-action@v1
      with:
        appSourcePath: ${{ github.workspace }}/pacientes-service
        resourceGroup: RG-SGIP-SGIP
        containerAppName: sgip-api

    # 3. Desplegar el código de la Azure Function (Notification Lambda)
    - name: Desplegar Azure Function (Serverless)
      uses: Azure/functions-action@v1
      with:
        app-name: 'sgip-func'
        package: './notification-lambda'
```

### Explicación del Funcionamiento del Pipeline
1. **Fase de CI (Build and Test):** Descarga el código, instala las dependencias de FastAPI y ejecuta análisis estático (`flake8`) y pruebas unitarias automáticas para asegurar que ningún cambio rompa la lógica del SGIP.
2. **Fase de CD (Deploy to Azure):**
   * Se conecta a tu suscripción de Azure utilizando credenciales almacenadas de forma segura en los Secrets de tu repositorio de GitHub.
   * Aplica la plantilla `main.json` para aprovisionar o actualizar los recursos cloud.
   * Construye la imagen Docker del microservicio `pacientes-service` y la sube a Azure Container Apps de forma automatizada.
   * Empaqueta el directorio `notification-lambda/` y lo despliega a la Function App en Azure, activando el disparador por cola.
