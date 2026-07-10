from fastapi import FastAPI, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import List
import json
import redis
import hashlib
import uuid

from database import engine, Base, get_db
from models import Paciente, PacienteCreate, PacienteResponse, Usuario, UserLogin, TokenResponse, UsuarioCreate, UsuarioResponse
from queue_manager import queue_manager
from config import settings

app = FastAPI(
    title="SGIP Patients Backend API",
    description="Core backend API for managing clinical records and patient telemedicine data of SGIP.",
    version="1.0.0"
)

# --- Password Hashing Helpers ---
def generate_salt() -> str:
    return uuid.uuid4().hex

def hash_password(password: str, salt: str) -> str:
    # Use SHA-256 with salt for robust password hashing
    password_salted = password + salt
    return hashlib.sha256(password_salted.encode('utf-8')).hexdigest()

def verify_password(password: str, salt: str, hashed: str) -> bool:
    return hash_password(password, salt) == hashed

# --- Token Verification Dependency ---
def verify_token(authorization: str = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Valid authorization token required (Bearer token)"
        )
    token = authorization.split(" ")[1]
    if not token.startswith("token-"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalid or expired"
        )
    username = token.replace("token-", "")
    return username

# Initialize database tables and seed default user on startup
@app.on_event("startup")
def startup_event():
    import time
    from database import SessionLocal
    from sqlalchemy import text
    
    print("Connecting to MySQL Database...")
    db_connected = False
    # Retry up to 15 times (30 seconds) to wait for MySQL initialization
    for i in range(15):
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            db_connected = True
            print("Successfully connected to MySQL Database.")
            break
        except Exception as e:
            print(f"Database not ready yet (Attempt {i+1}/15). Retrying in 2 seconds... Error: {e}")
            time.sleep(2)
            
    if not db_connected:
        print("CRITICAL ERROR: Could not connect to MySQL database on startup.")
    
    print("Initializing Database tables...")
    Base.metadata.create_all(bind=engine)
    print("Database tables initialized successfully.")
    
    # Seed default users: admin (admin role) and doctor (doctor role) from environment settings
    db = SessionLocal()
    try:
        user_count = db.query(Usuario).count()
        if user_count == 0:
            print("Seeding default users...")
            # 1. Admin User
            salt_admin = generate_salt()
            hashed_pw_admin = hash_password(settings.SEED_ADMIN_PASSWORD, salt_admin)
            admin_user = Usuario(
                username="admin",
                hashed_password=hashed_pw_admin,
                salt=salt_admin,
                role="admin"
            )
            db.add(admin_user)
            
            # 2. Doctor User
            salt_doctor = generate_salt()
            hashed_pw_doctor = hash_password(settings.SEED_DOCTOR_PASSWORD, salt_doctor)
            doctor_user = Usuario(
                username="doctor",
                hashed_password=hashed_pw_doctor,
                salt=salt_doctor,
                role="doctor"
            )
            db.add(doctor_user)
            
            db.commit()
            print("Default users created successfully via environment variables.")
        else:
            print(f"Database already seeded with {user_count} users.")
            
        # Seed patients if empty
        patient_count = db.query(Paciente).count()
        if patient_count == 0:
            print("Seeding initial clinical records...")
            initial_patients = [
                Paciente(
                    nombre="Carlos Mendoza",
                    email="carlos.mendoza@gmail.com",
                    telefono="+593 984 555 123",
                    diagnostico="Insuficiencia Cardíaca Congestiva",
                    tipo_examen="Ecocardiograma Transtorácico",
                    detalles="Paciente de 65 años presenta disnea de esfuerzo y edema en extremidades inferiores. Requiere control inmediato.",
                    estado="Crítico",
                    fecha_cita="2026-07-10T10:00"
                ),
                Paciente(
                    nombre="María José Delgado",
                    email="mj.delgado@yahoo.com",
                    telefono="+593 992 444 567",
                    diagnostico="Anemia Ferropénica Moderada",
                    tipo_examen="Hemograma Completo",
                    detalles="Niveles de hemoglobina bajos (10.2 g/dL). Se receta sulfato ferroso y dieta rica en hierro.",
                    estado="Estable",
                    fecha_cita=None
                ),
                Paciente(
                    nombre="Luis Alberto Plaza",
                    email="l.plaza@hotmail.com",
                    telefono="+593 979 333 901",
                    diagnostico="Diabetes Mellitus Tipo 2 Descompensada",
                    tipo_examen="Glucosa Postprandial",
                    detalles="Glicemia en ayunas elevada (180 mg/dL). Se ajusta dosis de metformina y se programa control en 15 días.",
                    estado="Observación",
                    fecha_cita="2026-07-24T08:30"
                ),
                Paciente(
                    nombre="Ana Cristina Ortiz",
                    email="ana.ortiz@gmail.com",
                    telefono="+593 981 777 654",
                    diagnostico="Hipercolesterolemia Familiar",
                    tipo_examen="Perfil Lipídico",
                    detalles="Colesterol total elevado (260 mg/dL). Inicio de atorvastatina 20mg diario.",
                    estado="Estable",
                    fecha_cita=None
                ),
                Paciente(
                    nombre="José Fernando Mora",
                    email="j.mora@sgip.gob.ec",
                    telefono="+593 995 888 321",
                    diagnostico="Insuficiencia Renal Crónica G3",
                    tipo_examen="Perfil Renal",
                    detalles="Creatinina en 2.1 mg/dL y Tasa de Filtración Glomerular en 45. Mantener hidratación.",
                    estado="Observación",
                    fecha_cita="2026-07-15T11:00"
                ),
                Paciente(
                    nombre="Elena Sofía Salazar",
                    email="elena.salazar@outlook.com",
                    telefono="+593 987 111 890",
                    diagnostico="Hipotiroidismo Primario",
                    tipo_examen="Perfil Tiroideo",
                    detalles="TSH ligeramente elevada (6.2 uIU/mL). Se mantiene dosis actual de Levotiroxina 75mcg.",
                    estado="Estable",
                    fecha_cita=None
                ),
                Paciente(
                    nombre="Roberto Gabriel Torres",
                    email="roberto.torres@gmail.com",
                    telefono="+593 993 222 789",
                    diagnostico="Sospecha de Hepatitis Aguda",
                    tipo_examen="Perfil Hepático",
                    detalles="Transaminasas extremadamente elevadas (ALT 450, AST 380). Paciente presenta ictericia leve.",
                    estado="Crítico",
                    fecha_cita="2026-07-10T09:00"
                ),
                Paciente(
                    nombre="Carmen Yolanda Vivas",
                    email="carmen.vivas@yahoo.es",
                    telefono="+593 969 666 456",
                    diagnostico="Hipertensión Arterial Grado 2",
                    tipo_examen="Monitoreo Presión Arterial",
                    detalles="Presión promedio de 155/95 mmHg en los últimos 3 días. Se prescribe enalapril 10mg.",
                    estado="Observación",
                    fecha_cita="2026-07-17T16:00"
                ),
                Paciente(
                    nombre="Francisco Javier Cedeño",
                    email="f.cedeno@gmail.com",
                    telefono="+593 988 555 345",
                    diagnostico="Infección de Vías Urinarias Alta",
                    tipo_examen="Urocultivo & Orina",
                    detalles="Presencia de E. Coli sensible a Ciprofloxacino. Tratamiento antibiótico por 7 días.",
                    estado="Estable",
                    fecha_cita=None
                ),
                Paciente(
                    nombre="Diana Elizabeth Carrera",
                    email="diana.carrera@live.com",
                    telefono="+593 978 444 890",
                    diagnostico="Asma Bronquial Persistente",
                    tipo_examen="Espirometría",
                    detalles="Disminución leve del flujo espiratorio. Se añade budesonida/formoterol inhalador diario.",
                    estado="Observación",
                    fecha_cita="2026-07-22T14:30"
                ),
                Paciente(
                    nombre="Pedro Miguel Falconi",
                    email="pedro.falconi@gmail.com",
                    telefono="+593 991 222 123",
                    diagnostico="Infarto Agudo al Miocardio Antiguo",
                    tipo_examen="Electrocardiograma de 12 Derivaciones",
                    detalles="Electrocardiograma muestra secuela de infarto inferior. Paciente asintomático en tratamiento con Aspirina.",
                    estado="Estable",
                    fecha_cita=None
                ),
                Paciente(
                    nombre="Lucía Valeria Beltrán",
                    email="lucia.beltran@outlook.com",
                    telefono="+593 994 333 456",
                    diagnostico="Artritis Reumatoidea Juvenil",
                    tipo_examen="Factor Reumatoideo & PCR",
                    detalles="PCR elevada (12 mg/L) con dolor articular moderado en rodillas. Se prescribe antiinflamatorios.",
                    estado="Observación",
                    fecha_cita="2026-07-19T10:30"
                ),
                Paciente(
                    nombre="Manuel Ricardo Benítez",
                    email="manuel.benitez@gmail.com",
                    telefono="+593 985 444 789",
                    diagnostico="Leucemia Linfoide Crónica (Control)",
                    tipo_examen="Hemograma Completo",
                    detalles="Leucocitosis marcada (45,000/uL) con predominio de linfocitos maduros. Derivación inmediata a hematología.",
                    estado="Crítico",
                    fecha_cita="2026-07-10T12:00"
                ),
                Paciente(
                    nombre="Patricia Janet Galarza",
                    email="patricia.galarza@gmail.com",
                    telefono="+593 996 555 901",
                    diagnostico="Colelitiasis Sintomática",
                    tipo_examen="Ecografía Abdominal Superior",
                    detalles="Presencia de múltiples cálculos vesiculares de hasta 12mm. Se programa cita con cirujano general.",
                    estado="Observación",
                    fecha_cita="2026-07-20T08:00"
                ),
                Paciente(
                    nombre="Gabriela Fernanda Paz",
                    email="gabriela.paz@gmail.com",
                    telefono="+593 982 666 321",
                    diagnostico="Control de Embarazo - Semanal 32",
                    tipo_examen="Ecografía Obstétrica Doppler",
                    detalles="Desarrollo fetal adecuado, peso aproximado de 1.8 kg. Presión arterial materna normal.",
                    estado="Estable",
                    fecha_cita=None
                )
            ]
            for p in initial_patients:
                db.add(p)
            db.commit()
            print(f"Clinical records database successfully seeded with {len(initial_patients)} patients.")
            print(f"Database already populated with {patient_count} patient files. Enriched check...")
            # Check and enrich existing patients with vital signs if not present
            all_patients = db.query(Paciente).all()
            updated = False
            for p in all_patients:
                if "[Signos Vitales" not in (p.detalles or ""):
                    if p.nombre == "Carlos Mendoza":
                        p.detalles = "Paciente de 65 años presenta disnea de esfuerzo y edema en extremidades inferiores. Requiere control inmediato. [Signos Vitales: Temp: 37.0, FC: 110, SatO2: 90, PA: 145/95]"
                        updated = True
                    elif p.nombre == "María José Delgado":
                        p.detalles = "Niveles de hemoglobina bajos (10.2 g/dL). Se receta sulfato ferroso y dieta rica en hierro. [Signos Vitales: Temp: 36.5, FC: 72, SatO2: 98, PA: 115/75]"
                        updated = True
                    elif p.nombre == "Luis Alberto Plaza":
                        p.detalles = "Glicemia en ayunas elevada (180 mg/dL). Se ajusta dosis de metformina y se programa control en 15 días. [Signos Vitales: Temp: 36.8, FC: 82, SatO2: 97, PA: 130/80]"
                        updated = True
                    elif p.nombre == "José Fernando Mora":
                        p.detalles = "Creatinina en 2.1 mg/dL y Tasa de Filtración Glomerular en 45. Mantener hidratación. [Signos Vitales: Temp: 36.6, FC: 78, SatO2: 96, PA: 125/80]"
                        updated = True
                    elif p.nombre == "Roberto Gabriel Torres":
                        p.detalles = "Transaminasas extremadamente elevadas (ALT 450, AST 380). Paciente presenta ictericia leve. [Signos Vitales: Temp: 38.5, FC: 90, SatO2: 96, PA: 110/70]"
                        updated = True
                    elif p.nombre == "Carmen Yolanda Vivas":
                        p.detalles = "Presión promedio de 155/95 mmHg en los últimos 3 días. Se prescribe enalapril 10mg. [Signos Vitales: Temp: 36.5, FC: 78, SatO2: 98, PA: 155/95]"
                        updated = True
                    elif p.nombre == "Diana Elizabeth Carrera":
                        p.detalles = "Disminución leve del flujo espiratorio. Se añade budesonida/formoterol inhalador diario. [Signos Vitales: Temp: 36.9, FC: 85, SatO2: 95, PA: 120/80]"
                        updated = True
                    elif p.nombre == "Lucía Valeria Beltrán":
                        p.detalles = "PCR elevada (12 mg/L) con dolor articular moderado en rodillas. Se prescribe antiinflamatorios. [Signos Vitales: Temp: 37.2, FC: 88, SatO2: 97, PA: 122/82]"
                        updated = True
                    elif p.nombre == "Manuel Ricardo Benítez":
                        p.detalles = "Leucocitosis marcada (45,000/uL) con predominio de linfocitos maduros. Derivación inmediata a hematología. [Signos Vitales: Temp: 37.8, FC: 105, SatO2: 94, PA: 135/85]"
                        updated = True
                    elif p.nombre == "Patricia Janet Galarza":
                        p.detalles = "Presencia de múltiples cálculos vesiculares de hasta 12mm. Se programa cita con cirujano general. [Signos Vitales: Temp: 36.7, FC: 70, SatO2: 98, PA: 110/70]"
                        updated = True
                    elif p.nombre == "Gabriela Fernanda Paz":
                        p.detalles = "Desarrollo fetal adecuado, peso aproximado de 1.8 kg. Presión arterial materna normal. [Signos Vitales: Temp: 36.6, FC: 84, SatO2: 99, PA: 115/75]"
                        updated = True
            if updated:
                db.commit()
                print("Seeded patients successfully updated with structured vitals in MySQL database.")
    except Exception as e:
        print(f"Error seeding database: {e}")
    finally:
        db.close()

# Redis client connection
def get_redis():
    try:
        r = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            decode_responses=True
        )
        return r
    except Exception as e:
        print(f"Failed to connect to Redis: {e}")
        return None

# Healthcheck Endpoint
@app.get("/api/v1/health")
def healthcheck():
    return {"status": "healthy", "environment": settings.ENVIRONMENT}

# POST: Authenticate user (Login)
@app.post("/api/v1/auth/login", response_model=TokenResponse)
def login(login_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(Usuario).filter(Usuario.username == login_data.username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
        
    if not verify_password(login_data.password, user.salt, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
        
    # Return mock token containing username
    token = f"token-{user.username}"
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user.username,
        "role": user.role
    }

# POST: Create a new Patient (Protected)
@app.post("/api/v1/patients", response_model=PacienteResponse, status_code=status.HTTP_201_CREATED)
def create_patient(
    patient_create: PacienteCreate, 
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
        # Enforce admin role check
    user = db.query(Usuario).filter(Usuario.username == username).first()
    if not user or user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permissions required to register a patient."
        )

    # 1. Persist in MySQL Database
    db_patient = Paciente(
        nombre=patient_create.nombre,
        email=patient_create.email,
        telefono=patient_create.telefono,
        diagnostico=patient_create.diagnostico,
        tipo_examen=patient_create.tipo_examen,
        detalles=patient_create.detalles,
        estado=patient_create.estado,
        fecha_cita=patient_create.fecha_cita
    )
    db.add(db_patient)
    db.commit()
    db.refresh(db_patient)

    # 2. Format event payload
    event_data = {
        "id": db_patient.id,
        "nombre": db_patient.nombre,
        "email": db_patient.email,
        "telefono": db_patient.telefono,
        "diagnostico": db_patient.diagnostico,
        "tipo_examen": db_patient.tipo_examen,
        "detalles": db_patient.detalles,
        "estado": db_patient.estado,
        "fecha_cita": db_patient.fecha_cita,
        "action": "created"
    }

    # 3. Publish event to Queue (RabbitMQ or Azure Service Bus)
    try:
        queue_manager.publish_patient_event(event_data)
    except Exception as e:
        print(f"[WARNING] Event publishing failed: {e}")

    return db_patient

# GET: Fetch all Patients from MySQL (Protected)
@app.get("/api/v1/patients", response_model=List[PacienteResponse])
def get_patients(
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    patients = db.query(Paciente).order_by(Paciente.id.desc()).all()
    return patients

# PUT: Update an existing Patient (Protected)
@app.put("/api/v1/patients/{patient_id}", response_model=PacienteResponse)
def update_patient(
    patient_id: int,
    patient_update: PacienteCreate,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    # Enforce admin role check
    user = db.query(Usuario).filter(Usuario.username == username).first()
    if not user or user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permissions required to update a patient file."
        )

    db_patient = db.query(Paciente).filter(Paciente.id == patient_id).first()
    if not db_patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient clinical file not found"
        )
    
    db_patient.nombre = patient_update.nombre
    db_patient.email = patient_update.email
    db_patient.telefono = patient_update.telefono
    db_patient.diagnostico = patient_update.diagnostico
    db_patient.tipo_examen = patient_update.tipo_examen
    db_patient.detalles = patient_update.detalles
    db_patient.estado = patient_update.estado
    db_patient.fecha_cita = patient_update.fecha_cita
    
    db.commit()
    db.refresh(db_patient)
    
    # Format and publish event to queue
    event_data = {
        "id": db_patient.id,
        "nombre": db_patient.nombre,
        "email": db_patient.email,
        "telefono": db_patient.telefono,
        "diagnostico": db_patient.diagnostico,
        "tipo_examen": db_patient.tipo_examen,
        "detalles": db_patient.detalles,
        "estado": db_patient.estado,
        "fecha_cita": db_patient.fecha_cita,
        "action": "updated"
    }
    try:
        queue_manager.publish_patient_event(event_data)
    except Exception as e:
        print(f"[WARNING] Event publishing failed on update: {e}")
        
    return db_patient

# DELETE: Remove a Patient File (Protected)
@app.delete("/api/v1/patients/{patient_id}", status_code=status.HTTP_200_OK)
def delete_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    # Enforce admin role check
    user = db.query(Usuario).filter(Usuario.username == username).first()
    if not user or user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permissions required to delete a patient file."
        )

    db_patient = db.query(Paciente).filter(Paciente.id == patient_id).first()
    if not db_patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient clinical file not found"
        )
    
    db.delete(db_patient)
    db.commit()
    
    # Publish delete event to queue
    event_data = {
        "id": patient_id,
        "action": "deleted"
    }
    try:
        queue_manager.publish_patient_event(event_data)
    except Exception as e:
        print(f"[WARNING] Event publishing failed on delete: {e}")
        
    return {"message": "Patient file successfully deleted", "id": patient_id}

# GET: Fetch processed health notifications from Redis Cache (Protected)
@app.get("/api/v1/patients/notifications")
def get_notifications(
    redis_client = Depends(get_redis),
    username: str = Depends(verify_token)
):
    if redis_client is None:
        return []
    
    try:
        # Retrieve all notifications from Redis List
        logs = redis_client.lrange("patients_notifications_list", 0, -1)
        parsed_logs = []
        for log in logs:
            try:
                parsed_logs.append(json.loads(log))
            except Exception:
                continue
        return parsed_logs
    except Exception as e:
        print(f"Error reading from Redis: {e}")
        return []

# DELETE: Clear all health notifications from Redis Cache (Protected)
@app.delete("/api/v1/patients/notifications")
def delete_notifications(
    redis_client = Depends(get_redis),
    username: str = Depends(verify_token)
):
    if redis_client is None:
        raise HTTPException(
            status_code=500,
            detail="Redis connection not available"
        )
    try:
        redis_client.delete("patients_notifications_list")
        return {"message": "Health notification logs successfully cleared"}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error clearing cache: {e}"
        )

from pydantic import BaseModel

class LabIngestRequest(BaseModel):
    provider: str
    payload: str

# POST: Ingest laboratory result from external provider (Adapter Pattern - Protected)
@app.post("/api/v1/patients/ingest-lab", status_code=status.HTTP_201_CREATED)
def ingest_laboratory_result(
    request: LabIngestRequest,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    # 1. Enforce admin role check
    user = db.query(Usuario).filter(Usuario.username == username).first()
    if not user or user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permissions required to ingest external laboratory data."
        )

    # 2. Parse and adapt data based on selected provider (Adapter Pattern)
    try:
        if request.provider == "central_json":
            # JSON Adapter
            data = json.loads(request.payload)
            nombre = data.get("patient_name", "Desconocido")
            tipo_examen = data.get("lab_test", "Examen General")
            estado = data.get("health_status", "Estable")
            detalles = data.get("observations", "")
            diagnostico = "Anemia Feroz / Sospecha Crítica" if estado == "Crítico" else "Chequeo Preventivo JSON"
            email = "paciente.json@sgip.gob.ec"
            telefono = "+593 999 999 999"
        elif request.provider == "sanjose_xml":
            # XML Adapter
            import xml.etree.ElementTree as ET
            root = ET.fromstring(request.payload)
            
            # Extract elements from XML hierarchy
            nombre_node = root.find("nombre_paciente")
            tipo_node = root.find("tipo")
            estado_node = root.find("estado_salud")
            detalles_node = root.find("detalles_clinicos")
            
            nombre = nombre_node.text if nombre_node is not None else "Desconocido"
            tipo_examen = tipo_node.text if tipo_node is not None else "Examen General"
            estado = estado_node.text if estado_node is not None else "Estable"
            detalles = detalles_node.text if detalles_node is not None else ""
            diagnostico = "Cardiopatía en Observación" if estado == "Observación" else "Chequeo Preventivo XML"
            email = "paciente.xml@sgip.gob.ec"
            telefono = "+593 999 999 999"
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported laboratory provider format."
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Adapter translation failed. Verify formatting. Error: {e}"
        )

    # 3. Standardize date for control if Critical or Observation
    from datetime import datetime, timedelta
    fecha_cita = None
    if estado != "Estable":
        # Schedule checkup in 1 day
        fecha_cita = (datetime.utcnow() + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M")

    # 4. Save adapted clinical record in MySQL
    db_patient = Paciente(
        nombre=nombre,
        email=email,
        telefono=telefono,
        diagnostico=diagnostico,
        tipo_examen=tipo_examen,
        detalles=detalles,
        estado=estado,
        fecha_cita=fecha_cita
    )
    db.add(db_patient)
    db.commit()
    db.refresh(db_patient)

    # 5. Format and publish clinical event to queue
    event_data = {
        "id": db_patient.id,
        "nombre": db_patient.nombre,
        "email": db_patient.email,
        "telefono": db_patient.telefono,
        "diagnostico": db_patient.diagnostico,
        "tipo_examen": db_patient.tipo_examen,
        "detalles": db_patient.detalles,
        "estado": db_patient.estado,
        "fecha_cita": db_patient.fecha_cita,
        "action": "created"
    }
    try:
        queue_manager.publish_patient_event(event_data)
    except Exception as e:
        print(f"[WARNING] Event publishing failed on lab ingest: {e}")

    return {
        "message": "Laboratory result adapted and ingested successfully.",
        "patient_id": db_patient.id,
        "adapted_record": {
            "nombre": db_patient.nombre,
            "tipo_examen": db_patient.tipo_examen,
            "estado": db_patient.estado,
            "diagnostico": db_patient.diagnostico
        }
    }

# --- User CRUD Endpoints for Administration ---

# GET: List all users (Protected - Admin only)
@app.get("/api/v1/users", response_model=List[UsuarioResponse])
def get_users(
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    # Enforce admin role check
    user = db.query(Usuario).filter(Usuario.username == username).first()
    if not user or user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permissions required to list system users."
        )
    return db.query(Usuario).order_by(Usuario.id.asc()).all()

# POST: Create a new user (Protected - Admin only)
@app.post("/api/v1/users", response_model=UsuarioResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    new_user: UsuarioCreate,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    # Enforce admin role check
    user = db.query(Usuario).filter(Usuario.username == username).first()
    if not user or user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permissions required to create new users."
        )
    
    # Check if username already exists
    existing = db.query(Usuario).filter(Usuario.username == new_user.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered."
        )
        
    salt = generate_salt()
    hashed_pw = hash_password(new_user.password, salt)
    
    db_user = Usuario(
        username=new_user.username,
        hashed_password=hashed_pw,
        salt=salt,
        role=new_user.role
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

# DELETE: Remove a user (Protected - Admin only)
@app.delete("/api/v1/users/{user_name}", status_code=status.HTTP_200_OK)
def delete_user(
    user_name: str,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    # Enforce admin role check
    user = db.query(Usuario).filter(Usuario.username == username).first()
    if not user or user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permissions required to delete users."
        )
        
    # Prevent deleting yourself
    if user_name == username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own logged-in user account."
        )
        
    # Prevent deleting original system seed admin/doctor to maintain stability
    if user_name in ["admin", "doctor"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deletion of system default seed accounts is restricted."
        )
        
    db_user = db.query(Usuario).filter(Usuario.username == user_name).first()
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinical user account not found"
        )
        
    db.delete(db_user)
    db.commit()
    return {"message": f"User '{user_name}' successfully removed from database.", "username": user_name}


@app.put("/api/v1/users/{user_name}", status_code=status.HTTP_200_OK)
def update_user(
    user_name: str,
    body: dict,
    db: Session = Depends(get_db),
    username: str = Depends(verify_token)
):
    """Update role and/or password of an existing clinical staff account."""
    # Enforce admin role check
    caller = db.query(Usuario).filter(Usuario.username == username).first()
    if not caller or caller.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permissions required to edit users."
        )

    db_user = db.query(Usuario).filter(Usuario.username == user_name).first()
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinical user account not found."
        )

    # Update role if provided
    new_role = body.get("role")
    if new_role and new_role in ["admin", "doctor"]:
        db_user.role = new_role

    # Update password if provided
    new_password = body.get("password")
    if new_password:
        if len(new_password) < 6:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password must be at least 6 characters."
            )
        salt = secrets.token_hex(16)
        hashed = hashlib.sha256((new_password + salt).encode()).hexdigest()
        db_user.hashed_password = hashed
        db_user.salt = salt

    db.commit()
    db.refresh(db_user)
    return {"message": f"User '{user_name}' updated successfully.", "username": user_name, "role": db_user.role}
