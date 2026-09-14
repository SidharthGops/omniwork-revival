from sqlmodel import SQLModel, Session, create_engine, select

from app.models import Member

DATABASE_URL = "sqlite:///./omniwork.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        existing = session.exec(select(Member)).first()
        if existing:
            return
        # Seed a small demo team so the dashboard isn't empty on first run.
        demo_members = [
            Member(name="Alex Rao", role="Backend engineer"),
            Member(name="Priya Nair", role="Frontend engineer"),
            Member(name="Sam George", role="Design"),
        ]
        for m in demo_members:
            session.add(m)
        session.commit()


def get_session():
    with Session(engine) as session:
        yield session
