@echo off
title Iniciar Proyecto Integrador - INSECOM CRM
color 0B

echo =======================================================================
echo              INSECOM S.A. - PORTAL DE GESTION COMERCIAL
echo            Diseno y Arquitectura de Software (Proyecto Integrador)
echo =======================================================================
echo.
echo Integrantes: Jean Carlos Gomez, Adrian Morales, Adrian Puco.
echo.
echo [1/3] Verificando Docker Desktop...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Docker no esta instalado o no esta en el PATH del sistema.
    echo Por favor, instala Docker Desktop antes de ejecutar este script.
    echo.
    pause
    exit /b
)

docker info >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Docker Desktop no esta iniciado o el motor de Docker no esta corriendo.
    echo Por favor, abre la aplicacion Docker Desktop en tu PC y espera a que este activa (icono verde) antes de continuar.
    echo.
    pause
    exit /b
)


echo [2/3] Levantando contenedores y compilandolos (docker-compose up)...
echo.
echo Iniciando proceso en segundo plano, por favor espera...
start "" http://localhost/
start "" http://localhost/docs

:: Ejecutar docker-compose up --build para compilar e iniciar mostrando logs en tiempo real
docker-compose up --build

echo.
echo Contenedores detenidos. Limpiando recursos de Docker...
docker-compose down
echo Proceso finalizado.
pause
