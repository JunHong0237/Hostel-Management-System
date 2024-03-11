{ pkgs }: {
  deps = [
    pkgs.dotenv.config(); // Load environment variables from .env file
    pkgs.import mysql from 'mysql';
  ];
}