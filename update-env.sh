#!/bin/bash

echo "🔧 Updating Vercel Environment Variables for OpenAI"
echo "===================================================="
echo ""

echo "📝 Step 1: Update LLM_MODE"
echo "   Go to: https://vercel.com/matthews-projects-d2719c68/amigo-primary-care/settings/environment-variables"
echo "   Find LLM_MODE and change value from 'mock' to 'openai'"
echo ""

echo "📝 Step 2: Add OPENAI_API_KEY"
echo "   Click 'Add New'"
echo "   Name: OPENAI_API_KEY"
echo "   Value: (your OpenAI API key)"
echo "   Environment: Production"
echo "   Click 'Save'"
echo ""

echo "📝 Step 3: After updating, run:"
echo "   vercel --prod"
echo ""

echo "Or run this script with your API key:"
echo "   ./update-env.sh YOUR_API_KEY_HERE"
echo ""

if [ -n "$1" ]; then
    echo "🔑 Adding API key..."
    echo "$1" | vercel env add OPENAI_API_KEY production 2>&1
    echo ""
    echo "✅ API key added! Now update LLM_MODE via dashboard, then run: vercel --prod"
fi

