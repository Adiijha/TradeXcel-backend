import dotenv from 'dotenv';
import express from 'express';
import connectDB from './db/index.js';
import { app } from './app.js';

if (process.env.NODE_ENV !== 'production') {
    const dotenv = await import('dotenv');
    dotenv.config({ path: './.env' });
}

connectDB()
.then(()=>{
    app.on("error",()=>{
        console.log('Error:', error);
        throw error
    });
    
    app.listen(process.env.PORT || 8000,()=>{
        console.log(`Server is running on port ${process.env.PORT}`);
    });

})
.catch((error)=>{
    console.log('Error:', error);
    throw error;
})

