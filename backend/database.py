"""
database.py
---------------------------------------------------------------------------
MongoDB Persistence Layer with Automatic In-Memory Fallback.
Provides unified async collection interfaces matching MongoDB:
 - users
 - exams
 - exam_sessions
 - proctoring_events
 - risk_scores
 - evidence
 - behaviour_chains
 - network_events
 - faculty_reviews
 - audit_logs
"""

import os
import json
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from pathlib import Path

# Load .env configuration
try:
    from dotenv import load_dotenv
    # Search for .env in current directory and parent directory
    env_path = Path(__file__).resolve().parent / ".env"
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
    else:
        load_dotenv()
except ImportError:
    pass

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "nextgen_proctor")

COLLECTION_NAMES = [
    "users", "exams", "exam_sessions", "proctoring_events",
    "risk_scores", "evidence", "behaviour_chains",
    "network_events", "faculty_reviews", "audit_logs"
]


def _clean_mongo_doc(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Sanitize MongoDB document for FastAPI JSON serialization (convert ObjectId to str)."""
    if doc is None:
        return None
    d = dict(doc)
    if "_id" in d:
        d["_id"] = str(d["_id"])
        if "id" not in d:
            d["id"] = d["_id"]
    return d


class InMemoryCollection:
    """Async in-memory collection mimicking MongoDB collection semantics."""
    def __init__(self, name: str):
        self.name = name
        self.documents: List[Dict[str, Any]] = []

    async def find(self, query: Dict[str, Any] = None, sort: List = None, limit: int = 0) -> List[Dict[str, Any]]:
        query = query or {}
        results = []
        for doc in self.documents:
            match = True
            for k, v in query.items():
                if doc.get(k) != v:
                    match = False
                    break
            if match:
                results.append(dict(doc))
        if sort:
            for field, direction in reversed(sort):
                results.sort(key=lambda x: x.get(field, ""), reverse=(direction == -1))
        if limit > 0:
            results = results[:limit]
        return results

    async def find_one(self, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        for doc in self.documents:
            match = True
            for k, v in query.items():
                if doc.get(k) != v:
                    match = False
                    break
            if match:
                return dict(doc)
        return None

    async def insert_one(self, document: Dict[str, Any]) -> Dict[str, Any]:
        doc_copy = dict(document)
        if "id" not in doc_copy and "_id" not in doc_copy:
            doc_copy["id"] = f"{self.name}_{len(self.documents) + 1}_{int(datetime.now().timestamp()*1000)}"
        self.documents.append(doc_copy)
        return {"inserted_id": doc_copy.get("id") or doc_copy.get("_id")}

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False):
        set_vals = update.get("$set", update)
        for doc in self.documents:
            match = True
            for k, v in query.items():
                if doc.get(k) != v:
                    match = False
                    break
            if match:
                doc.update(set_vals)
                return {"matched_count": 1, "modified_count": 1}
        if upsert:
            new_doc = dict(query)
            new_doc.update(set_vals)
            await self.insert_one(new_doc)
            return {"matched_count": 0, "upserted_id": new_doc.get("id")}
        return {"matched_count": 0, "modified_count": 0}

    async def delete_one(self, query: Dict[str, Any]):
        for idx, doc in enumerate(self.documents):
            match = True
            for k, v in query.items():
                if doc.get(k) != v:
                    match = False
                    break
            if match:
                self.documents.pop(idx)
                return {"deleted_count": 1}
        return {"deleted_count": 0}

    async def count_documents(self, query: Dict[str, Any] = None) -> int:
        query = query or {}
        matches = await self.find(query)
        return len(matches)


class MongoCollectionWrapper:
    """
    Async wrapper around Motor collection providing unified async signatures
    matching InMemoryCollection and ensuring JSON-serializable documents.
    """
    def __init__(self, motor_collection, name: str):
        self.collection = motor_collection
        self.name = name

    async def find(self, query: Dict[str, Any] = None, sort: List = None, limit: int = 0) -> List[Dict[str, Any]]:
        query = query or {}
        cursor = self.collection.find(query)
        if sort:
            cursor = cursor.sort(sort)
        if limit > 0:
            cursor = cursor.limit(limit)
        docs = await cursor.to_list(length=1000 if limit <= 0 else limit)
        return [_clean_mongo_doc(d) for d in docs]

    async def find_one(self, query: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        query = query or {}
        doc = await self.collection.find_one(query)
        return _clean_mongo_doc(doc)

    async def insert_one(self, document: Dict[str, Any]) -> Dict[str, Any]:
        doc_copy = dict(document)
        if "id" not in doc_copy and "_id" not in doc_copy:
            doc_copy["id"] = f"{self.name}_{int(datetime.now().timestamp()*1000)}"
        result = await self.collection.insert_one(doc_copy)
        inserted_id = str(result.inserted_id) if hasattr(result, "inserted_id") else doc_copy.get("id")
        return {"inserted_id": inserted_id}

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> Dict[str, Any]:
        result = await self.collection.update_one(query, update, upsert=upsert)
        return {
            "matched_count": result.matched_count,
            "modified_count": result.modified_count,
            "upserted_id": str(result.upserted_id) if result.upserted_id else None
        }

    async def delete_one(self, query: Dict[str, Any]) -> Dict[str, Any]:
        result = await self.collection.delete_one(query)
        return {"deleted_count": result.deleted_count}

    async def count_documents(self, query: Dict[str, Any] = None) -> int:
        query = query or {}
        return await self.collection.count_documents(query)


def get_default_seed_data():
    """Generates initial seed users and examination dataset."""
    now = datetime.now(timezone.utc).isoformat()
    users = [
        {
            "id": "u-student",
            "name": "Aarav Sharma",
            "email": "student@demo.com",
            "password": "student123",
            "role": "student",
            "department": "Computer Science",
            "faceEnrolled": True,
            "createdAt": now
        },
        {
            "id": "u-faculty",
            "name": "Dr. Meera Iyer",
            "email": "faculty@demo.com",
            "password": "faculty123",
            "role": "faculty",
            "department": "Computer Science",
            "faceEnrolled": True,
            "createdAt": now
        },
        {
            "id": "u-admin",
            "name": "System Administrator",
            "email": "admin@demo.com",
            "password": "admin123",
            "role": "admin",
            "department": "Academic Affairs",
            "faceEnrolled": True,
            "createdAt": now
        }
    ]

    exams = [
        {
            "id": "e1",
            "title": "CS402: Deep Learning & Computer Vision Final Exam",
            "subject": "Artificial Intelligence",
            "durationMin": 90,
            "scheduledAt": now,
            "instructions": "Full AI Proctoring active. Camera, microphone, and screen sharing required. No mobile phones, secondary persons, or reference materials permitted.",
            "prohibitedObjects": ["cell phone", "book", "laptop", "tablet"],
            "riskThresholds": {"low": 30, "medium": 65, "critical": 85},
            "questions": [
                {
                    "id": "mcq-1",
                    "text": "Which architectural category does YOLOv8 belong to in computer vision?",
                    "options": [
                        "Two-stage object detector",
                        "Single-shot anchor-free detector",
                        "Recurrent neural network",
                        "Markov random field"
                    ],
                    "answer": 1,
                    "points": 2,
                    "category": "Computer Vision"
                },
                {
                    "id": "mcq-2",
                    "text": "How many 3D facial landmarks does the MediaPipe FaceMesh model predict in real time?",
                    "options": ["68 landmarks", "128 landmarks", "468 / 478 landmarks", "1024 landmarks"],
                    "answer": 2,
                    "points": 2,
                    "category": "Computer Vision"
                },
                {
                    "id": "mcq-3",
                    "text": "Estimating 3D head pose from 2D facial landmarks commonly solves which geometric computer vision problem?",
                    "options": ["Perspective-n-Point (PnP)", "Dijkstra Algorithm", "Travelling Salesperson", "Bipartite Matching"],
                    "answer": 0,
                    "points": 2,
                    "category": "Computer Vision"
                },
                {
                    "id": "mcq-4",
                    "text": "In Explainable AI (XAI), what do SHAP values calculate?",
                    "options": [
                        "Server network latency",
                        "Marginal feature contribution to an individual prediction",
                        "Batch training loss curve",
                        "Gradient clipping magnitude"
                    ],
                    "answer": 1,
                    "points": 2,
                    "category": "Explainable AI"
                },
                {
                    "id": "mcq-5",
                    "text": "In audio anomaly detection, what is RMS (Root Mean Square) energy primarily used to measure?",
                    "options": ["Pitch frequency", "Signal amplitude / loudness level", "Phoneme classification", "Language syntax"],
                    "answer": 1,
                    "points": 2,
                    "category": "Machine Learning"
                }
            ],
            "codingQuestions": [
                {
                    "id": "code-1",
                    "title": "Two Sum",
                    "difficulty": "Easy",
                    "points": 10,
                    "supportedLanguages": ["javascript", "python", "c", "cpp", "java"],
                    "description": "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.",
                    "starterCode": {
                        "python": "def solution(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        diff = target - n\n        if diff in seen:\n            return [seen[diff], i]\n        seen[n] = i\n    return []\n",
                        "javascript": "function solution(nums, target) {\n    const map = new Map();\n    for (let i = 0; i < nums.length; i++) {\n        const diff = target - nums[i];\n        if (map.has(diff)) return [map.get(diff), i];\n        map.set(nums[i], i);\n    }\n    return [];\n}\n",
                        "c": "#include <stdio.h>\nvoid solution() {\n    printf(\"[0, 1]\\n\");\n}\nint main() { solution(); return 0; }\n",
                        "cpp": "#include <iostream>\nint main() {\n    std::cout << \"[0, 1]\" << std::endl;\n    return 0;\n}\n",
                        "java": "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"[0, 1]\");\n    }\n}\n"
                    },
                    "testCases": [
                        {"input": "[2, 7, 11, 15], 9", "expectedOutput": "[0, 1]", "isHidden": False},
                        {"input": "[3, 2, 4], 6", "expectedOutput": "[1, 2]", "isHidden": False},
                        {"input": "[3, 3], 6", "expectedOutput": "[0, 1]", "isHidden": True}
                    ]
                },
                {
                    "id": "code-2",
                    "title": "Valid Palindrome",
                    "difficulty": "Easy",
                    "points": 10,
                    "supportedLanguages": ["javascript", "python", "c", "cpp", "java"],
                    "description": "A phrase is a palindrome if, after converting all uppercase letters to lowercase and removing non-alphanumeric characters, it reads the same forward and backward.",
                    "starterCode": {
                        "python": "def solution(s):\n    clean = ''.join(c.lower() for c in s if c.isalnum())\n    return clean == clean[::-1]\n",
                        "javascript": "function solution(s) {\n    const clean = s.toLowerCase().replace(/[^a-z0-9]/g, '');\n    return clean === clean.split('').reverse().join('');\n}\n",
                        "c": "#include <stdio.h>\nint main() { printf(\"true\\n\"); return 0; }\n",
                        "cpp": "#include <iostream>\nint main() { std::cout << \"true\" << std::endl; return 0; }\n",
                        "java": "public class Main { public static void main(String[] args) { System.out.println(\"true\"); } }\n"
                    },
                    "testCases": [
                        {"input": "\"A man, a plan, a canal: Panama\"", "expectedOutput": "true", "isHidden": False},
                        {"input": "\"race a car\"", "expectedOutput": "false", "isHidden": False}
                    ]
                }
            ]
        }
    ]
    return users, exams


class DatabaseManager:
    """Unified Database Manager handling real MongoDB with in-memory fallback."""
    def __init__(self):
        self.client = None
        self.db = None
        self.is_mongo = False
        self.collections: Dict[str, Any] = {}

    def initialize(self):
        uri = os.getenv("MONGODB_URI", MONGODB_URI)
        db_name = os.getenv("DATABASE_NAME", DATABASE_NAME)

        if uri:
            try:
                # 1. Test ping with PyMongo synchronously
                from pymongo import MongoClient
                sync_client = MongoClient(uri, serverSelectionTimeoutMS=2500)
                sync_client.admin.command("ping")
                sync_db = sync_client[db_name]

                # 2. Seed default users and exams into MongoDB if empty
                users_data, exams_data = get_default_seed_data()
                if sync_db["users"].count_documents({}) == 0:
                    sync_db["users"].insert_many([dict(u) for u in users_data])
                    print(f"[Database] Seeded {len(users_data)} default users into MongoDB ({db_name}.users)")

                if sync_db["exams"].count_documents({}) == 0:
                    sync_db["exams"].insert_many([dict(e) for e in exams_data])
                    print(f"[Database] Seeded default exam into MongoDB ({db_name}.exams)")

                sync_client.close()

                # 3. Initialize Async Motor Client
                import motor.motor_asyncio
                self.client = motor.motor_asyncio.AsyncIOMotorClient(uri)
                self.db = self.client[db_name]
                self.is_mongo = True

                for c in COLLECTION_NAMES:
                    self.collections[c] = MongoCollectionWrapper(self.db[c], c)

                print(f"[Database] SUCCESS: Connected to live MongoDB at {uri} -> Database: '{db_name}'")
                return

            except Exception as e:
                print(f"[Database] WARNING: Could not connect to MongoDB at {uri} ({e}).")
                print("[Database] Falling back to In-Memory Document Store.")

        # In-Memory fallback store
        self.is_mongo = False
        for c in COLLECTION_NAMES:
            self.collections[c] = InMemoryCollection(c)
        print("[Database] Initialized In-Memory MongoDB-compatible Document Store")
        self._seed_in_memory_default_data()

    def get_collection(self, name: str):
        return self.collections.get(name) or InMemoryCollection(name)

    def _seed_in_memory_default_data(self):
        users_data, exams_data = get_default_seed_data()
        self.collections["users"].documents = [dict(u) for u in users_data]
        self.collections["exams"].documents = [dict(e) for e in exams_data]


# Global Singleton instance
db_manager = DatabaseManager()
db_manager.initialize()
